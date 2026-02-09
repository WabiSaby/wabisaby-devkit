---
name: Switch Supabase to Keycloak
overview: "Replace Supabase-based JWT validation with Keycloak across wabisaby-core: config, shared auth (JWKS/issuer), HTTP/gRPC/WebSocket middleware, and tests. The app frontend does not use Supabase directly; only backend and devkit config references need updates."
todos: []
isProject: false
---

# Switch from Supabase to Keycloak Auth

## Current state

- **JWT validation** is centralized in [projects/wabisaby-core/internal/infrastructure/auth/jwt.go](projects/wabisaby-core/internal/infrastructure/auth/jwt.go): it uses a single Supabase base URL to build JWKS URL (`{url}/auth/v1/.well-known/jwks.json`) and issuer (`{url}/auth/v1`), and parses claims (`SupabaseClaims`: `email`, `sub`, `role`, `aud`, `tenant_id`, `user_id`).
- **Consumers** of that URL (all receive `cfg.Supabase.URL`):
  - [internal/api/middleware/jwt.go](projects/wabisaby-core/internal/api/middleware/jwt.go) – HTTP API
  - [internal/infrastructure/websocket/handler.go](projects/wabisaby-core/internal/infrastructure/websocket/handler.go) – WebSocket
  - [internal/node/grpc/server.go](projects/wabisaby-core/internal/node/grpc/server.go) and [internal/node/auth/](projects/wabisaby-core/internal/node/auth/) – gRPC (node coordinator)
- **Config**: [internal/config/config.go](projects/wabisaby-core/internal/config/config.go) has `SupabaseConfig{URL}`; [config/core.yaml](projects/wabisaby-core/config/core.yaml) has `supabase.url`; devkit lists `WABISABY_SUPABASE_URL` in [app/internal/config/backend.go](app/internal/config/backend.go).
- **Tests**: Integration tests use a test middleware when `Supabase.URL == ""` and [test/integration/shared/auth.go](projects/wabisaby-core/test/integration/shared/auth.go) generates JWTs with Supabase-style issuer/audience and `tenant_id`/`user_id` claims.

## Target state (Keycloak)

- **Keycloak endpoints** (realm-based):
  - JWKS: `{base}/realms/{realm}/protocol/openid-connect/certs`
  - Issuer: `{base}/realms/{realm}` (no trailing slash)
- **Claims**: Keycloak provides `sub`, `email`, `preferred_username`; it does **not** provide `tenant_id` or `user_id` by default. You have two options:
  - **Option A (recommended)**: Add Keycloak **custom claims** (e.g. via protocol mappers or custom ID token mappers) for `tenant_id` and `user_id` (UUIDs) so existing context keys and API behavior stay unchanged.
  - **Option B**: Use only Keycloak standard claims: treat `sub` as user identifier (store in `UserIDKey`; may require storing Keycloak `sub` in your DB if it is not UUID) and derive or omit tenant (e.g. from realm roles or a single default). This may require application and DB changes.

The plan below assumes **Option A** (Keycloak configured with custom claims `tenant_id` and `user_id`). If you choose Option B, the same code changes apply but claim mapping and docs should be adjusted accordingly.

---

## Implementation plan

### 1. Config: add Keycloak, remove Supabase

- In [projects/wabisaby-core/internal/config/config.go](projects/wabisaby-core/internal/config/config.go):
  - Add `KeycloakConfig` struct:
    ```go
    type KeycloakConfig struct {
        BaseURL string `mapstructure:"base_url"`
        Realm   string `mapstructure:"realm"`
    }
    ```
  - Add `Keycloak KeycloakConfig` field on `Config`.
  - **Remove** `Supabase` and `SupabaseConfig` entirely (clean cutover, no dual-support).
- In [projects/wabisaby-core/config/core.yaml](projects/wabisaby-core/config/core.yaml):
  - Add:
    ```yaml
    keycloak:
      base_url: "http://localhost:8180"
      realm: "wabisaby"
    ```
  - Remove the `supabase` section.
- In [app/internal/config/backend.go](app/internal/config/backend.go):
  - In `OptionalEnvVars()`: remove `WABISABY_SUPABASE_URL`, add `WABISABY_KEYCLOAK_BASE_URL` and `WABISABY_KEYCLOAK_REALM`.

### 2. Shared JWT validation (Keycloak JWKS + issuer)

- In [projects/wabisaby-core/internal/infrastructure/auth/jwt.go](projects/wabisaby-core/internal/infrastructure/auth/jwt.go):
  - Add an **OIDC config struct**:
    ```go
    // OIDCConfig holds OIDC provider endpoints for JWT validation.
    type OIDCConfig struct {
        JWKSURL string
        Issuer  string
    }

    // NewKeycloakOIDCConfig builds OIDCConfig from Keycloak base URL and realm.
    func NewKeycloakOIDCConfig(baseURL, realm string) OIDCConfig {
        base := strings.TrimSuffix(baseURL, "/")
        return OIDCConfig{
            JWKSURL: fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", base, realm),
            Issuer:  fmt.Sprintf("%s/realms/%s", base, realm),
        }
    }
    ```
  - Rename `SupabaseClaims` → `JWTClaims` (keep same JSON tags).
  - Change `ValidateTokenCore` signature:
    ```go
    func ValidateTokenCore(tokenString string, cfg OIDCConfig) (*JWTClaims, error)
    ```
  - **Fix panic on JWKS fetch failure**: Change `getOrCreateJWKS` to return `(keyfunc.Keyfunc, error)` instead of panicking. Update `ValidateTokenCore` to propagate the error gracefully:
    ```go
    func getOrCreateJWKS(jwksURL string) (keyfunc.Keyfunc, error) {
        // ... existing cache logic ...
        jwks, err := keyfunc.NewDefault([]string{jwksURL})
        if err != nil {
            return nil, fmt.Errorf("failed to fetch JWKS from %s: %w", jwksURL, err)
        }
        // ...
    }
    ```
  - Remove all Supabase-specific URL construction.

No change to [context.go](projects/wabisaby-core/internal/infrastructure/auth/context.go); context keys and `AuthContext` stay as-is.

### 3. Wire Keycloak config into all auth entrypoints

- **API**: In [projects/wabisaby-core/internal/container/api.go](projects/wabisaby-core/internal/container/api.go), `ProvideAuthMiddleware` should:
  ```go
  oidcCfg := auth.NewKeycloakOIDCConfig(cfg.Keycloak.BaseURL, cfg.Keycloak.Realm)
  return middleware.JWTMiddleware(oidcCfg)
  ```
  In [internal/api/middleware/jwt.go](projects/wabisaby-core/internal/api/middleware/jwt.go), change `JWTMiddleware(supabaseURL string)` → `JWTMiddleware(cfg auth.OIDCConfig)`.

- **WebSocket**: In [projects/wabisaby-core/internal/container/websocket.go](projects/wabisaby-core/internal/container/websocket.go), pass `OIDCConfig` into `NewHandler`. In [internal/infrastructure/websocket/handler.go](projects/wabisaby-core/internal/infrastructure/websocket/handler.go), replace `supabaseURL` field with `oidcCfg auth.OIDCConfig`.

- **Node gRPC**: In [projects/wabisaby-core/internal/container/network_coordinator.go](projects/wabisaby-core/internal/container/network_coordinator.go), pass `OIDCConfig` into `nodegrpc.NewServer`. Update [internal/node/grpc/server.go](projects/wabisaby-core/internal/node/grpc/server.go), [internal/node/auth/middleware.go](projects/wabisaby-core/internal/node/auth/middleware.go), and [internal/node/auth/token.go](projects/wabisaby-core/internal/node/auth/token.go) to use `OIDCConfig`.

### 4. Test mode and integration tests

- **Test mode**: Change condition from `Supabase.URL == ""` to `Keycloak.BaseURL == ""`. Update:
  - [internal/container/api.go](projects/wabisaby-core/internal/container/api.go)
  - [test/integration/shared/server.go](projects/wabisaby-core/test/integration/shared/server.go)

- **Test tokens**: In [projects/wabisaby-core/test/integration/shared/auth.go](projects/wabisaby-core/test/integration/shared/auth.go):
  - Update default `Issuer` to `http://localhost:8180/realms/wabisaby`
  - Update default `Audience` to `account` (Keycloak default) or keep `authenticated` if custom

- **Add unit tests** for `OIDCConfig` and `NewKeycloakOIDCConfig` in a new file `jwt_test.go`:
  ```go
  func TestNewKeycloakOIDCConfig(t *testing.T) {
      cfg := NewKeycloakOIDCConfig("http://localhost:8180", "wabisaby")
      assert.Equal(t, "http://localhost:8180/realms/wabisaby/protocol/openid-connect/certs", cfg.JWKSURL)
      assert.Equal(t, "http://localhost:8180/realms/wabisaby", cfg.Issuer)
  }
  ```

### 5. Docs and env

- Update [projects/wabisaby-core/docs/architecture/node-setup.md](projects/wabisaby-core/docs/architecture/node-setup.md) to describe Keycloak: realm, JWKS URL, issuer, and required token claims.
- Update `env.example` files with new variables.

---

## Summary of files to touch

| Area | Files |
|------|--------|
| Config | `internal/config/config.go`, `config/core.yaml`, `app/internal/config/backend.go` |
| Auth core | `internal/infrastructure/auth/jwt.go` (claims rename, OIDCConfig, error handling) |
| Auth tests | `internal/infrastructure/auth/jwt_test.go` (new) |
| API | `internal/api/middleware/jwt.go`, `internal/container/api.go` |
| WebSocket | `internal/container/websocket.go`, `internal/infrastructure/websocket/handler.go` |
| Node gRPC | `internal/container/network_coordinator.go`, `internal/node/grpc/server.go`, `internal/node/auth/middleware.go`, `internal/node/auth/token.go` |
| Tests | `test/integration/shared/server.go`, `test/integration/shared/auth.go` |
| Docs | `docs/architecture/node-setup.md` |
| **Docker** | `docker/docker-compose.yml`, `docker/keycloak/wabisaby-realm.json` (new), `projects/wabisaby-core/docker/docker-compose.infra.yml` |
| **DevKit** | `app/internal/service/docker.go`, `app/app.go`, `app/frontend/src/views/InfrastructureView.jsx` |

---

## 6. Add Keycloak Docker container

> **Port Note**: Use port **8180** (not 8080) because the `api` backend service already uses 8080.

### Root DevKit compose – [docker/docker-compose.yml](docker/docker-compose.yml)

Add a `keycloak` service:

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:26.0
  container_name: wabisaby-keycloak
  command: ["start-dev", "--import-realm"]
  environment:
    KC_BOOTSTRAP_ADMIN_USERNAME: admin
    KC_BOOTSTRAP_ADMIN_PASSWORD: admin
    KC_HTTP_PORT: 8180
  ports:
    - "8180:8180"
  volumes:
    - keycloak_data:/opt/keycloak/data
    - ./keycloak/wabisaby-realm.json:/opt/keycloak/data/import/wabisaby-realm.json:ro
  healthcheck:
    test: ["CMD-SHELL", "exec 3<>/dev/tcp/localhost/8180 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200 OK'"]
    interval: 10s
    timeout: 5s
    retries: 12
    start_period: 90s
  networks:
    - wabisaby-dev
```

Add to `volumes:` section:
```yaml
keycloak_data:
```

### Realm auto-configuration – [docker/keycloak/wabisaby-realm.json](docker/keycloak/wabisaby-realm.json) (new file)

Create a realm export file with pre-configured:
- Realm: `wabisaby`
- Client: `wabisaby-api` (public client for dev)
- Protocol mappers for `tenant_id` and `user_id` claims

Example structure:
```json
{
  "realm": "wabisaby",
  "enabled": true,
  "clients": [
    {
      "clientId": "wabisaby-api",
      "enabled": true,
      "publicClient": true,
      "directAccessGrantsEnabled": true,
      "standardFlowEnabled": true,
      "protocolMappers": [
        {
          "name": "tenant_id",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "config": {
            "user.attribute": "tenant_id",
            "claim.name": "tenant_id",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        },
        {
          "name": "user_id",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "config": {
            "user.attribute": "user_id",
            "claim.name": "user_id",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        }
      ]
    }
  ]
}
```

### Core infra compose – [projects/wabisaby-core/docker/docker-compose.infra.yml](projects/wabisaby-core/docker/docker-compose.infra.yml)

Add the same `keycloak` service (with container name `keycloak` instead of `wabisaby-keycloak`) for teams using only core's compose.

---

## 7. Add Keycloak to the DevKit app

### Backend – service discovery and control – [app/internal/service/docker.go](app/internal/service/docker.go)

Add to `containerMap`:
```go
"Keycloak": "wabisaby-keycloak",
```

Add to all `serviceMap` usages (StartService, StopService):
```go
"Keycloak": "keycloak",
```

### Backend – list and logs – [app/app.go](app/app.go)

In `ListServices()`:
```go
{Name: "Keycloak", Port: 8180},
```

In `serviceUIURLs`:
```go
"Keycloak": "http://localhost:8180/admin",
```

In `serviceNameMap`:
```go
"Keycloak": "keycloak",
```

### Frontend – Infrastructure view – [app/frontend/src/views/InfrastructureView.jsx](app/frontend/src/views/InfrastructureView.jsx)

Add import:
```jsx
import { Shield } from 'lucide-react';
```

Add to `getInfrastructureIcon()`:
```jsx
if (key.includes('keycloak')) return { icon: Shield, color: '#7c3aed' };
```

Add Vault icon while we're here (currently missing):
```jsx
if (key.includes('vault')) return { icon: Lock, color: '#fbbf24' };
```

---

## 8. Environment variable migration

### For existing developers

**Remove from `.env`:**
```
WABISABY_SUPABASE_URL=...
```

**Add to `.env`:**
```
WABISABY_KEYCLOAK_BASE_URL=http://localhost:8180
WABISABY_KEYCLOAK_REALM=wabisaby
```

### Update env.example

In [projects/wabisaby-core/env.example](projects/wabisaby-core/env.example):
- Remove `WABISABY_SUPABASE_URL`
- Add:
  ```
  # Keycloak (auth)
  WABISABY_KEYCLOAK_BASE_URL=http://localhost:8180
  WABISABY_KEYCLOAK_REALM=wabisaby
  ```

---

## Keycloak first-run setup (if not using auto-import)

If you don't use the realm JSON import, manually configure:

1. Access admin console: `http://localhost:8180/admin` (admin/admin)
2. Create realm: `wabisaby`
3. Create client: `wabisaby-api` (public client, direct access grants enabled)
4. For each user, set attributes:
   - `tenant_id`: UUID
   - `user_id`: UUID
5. Add protocol mappers to client for `tenant_id` and `user_id`

---

## Startup order consideration

Keycloak takes longer to start than other services (~60-90s on first run). Backend services that call `ValidateTokenCore` will fail if Keycloak isn't ready.

**Mitigations already in place:**
- JWKS fetch errors now return errors instead of panicking
- Test mode bypasses JWKS when `Keycloak.BaseURL == ""`

**Optional enhancement:**
- Add lazy JWKS initialization with background refresh
- Or add `depends_on: keycloak: condition: service_healthy` in docker-compose for backend services

---

## Checklist

- [ ] Config: Add `KeycloakConfig`, remove `SupabaseConfig`
- [ ] Auth: Add `OIDCConfig`, rename claims, fix panic
- [ ] Auth: Add unit tests for `OIDCConfig`
- [ ] API middleware: Update to use `OIDCConfig`
- [ ] WebSocket: Update to use `OIDCConfig`
- [ ] gRPC: Update to use `OIDCConfig`
- [ ] Tests: Update issuer/audience defaults
- [ ] Docker: Add Keycloak service on port 8180
- [ ] Docker: Create realm JSON for auto-import
- [ ] DevKit: Add Keycloak to service maps
- [ ] DevKit: Add Keycloak icon
- [ ] Docs: Update node-setup.md
- [ ] Docs: Update env.example files
