# Keycloak (wabisaby realm)

Keycloak runs at **http://localhost:8180**. Admin: **admin** / **admin**.

The `wabisaby` realm is used by the API and by the **storage node** for authentication. To run a node locally you need a token (or refresh token) from this realm.

## Node token (quick setup)

From the **devkit repo root**:

1. **Start Keycloak** (if not running):
   ```bash
   docker compose -f docker/docker-compose.yml up -d keycloak
   ```

2. **Create the node user** (one-time):
   ```bash
   ./docker/keycloak/create-node-user.sh node node
   ```
   If the user already exists but token request fails with "Account is not fully set up", run:
   ```bash
   ./docker/keycloak/fix-node-user.sh node
   ```

3. **Get token lines for `.env`** (node will refresh automatically):
   ```bash
   ./docker/keycloak/get-node-token.sh --env node node
   ```
   Paste the output into your **`.env`** at the devkit repo root. Then start the node from the devkit; it will use the refresh token to obtain and refresh the access token.

## Scripts

| Script | Purpose |
|--------|--------|
| `create-node-user.sh [user] [pass]` | Create a user (default: node / node). Run once. |
| `fix-node-user.sh [user]` | Fix "Account is not fully set up" for an existing user (sets firstName/lastName, clears required actions). |
| `get-node-token.sh [user] [pass]` | Print access token. |
| `get-node-token.sh --env [user] [pass]` | Print `.env` lines (refresh token + Keycloak URL) for automatic token refresh. |
| `set-user-attributes.sh <user> <tenant_id> <user_id>` | Set tenant_id and user_id on a Keycloak user (for API auth). |
| `add-protocol-mappers.sh` | Add tenant_id/user_id protocol mappers to wabisaby-web client (when realm was created before mappers existed). |
| `add-post-logout-uris.sh` | Add Valid Post Logout Redirect URIs to wabisaby-web client (fixes "Invalid redirect uri" on sign out). |

Requires **jq** (e.g. `brew install jq`).

## wabisaby-web client and logout

The realm JSON includes a **wabisaby-web** client. If you created the client manually, ensure it has **exactly** these URIs or you will see "invalid redirect uri" or 400 on logout.

**To force re-login** (e.g. after setting user attributes): Keycloak 26+ requires `id_token_hint` for the logout URL, so the direct URL often fails. Instead, clear Keycloak cookies: DevTools → Application → Cookies → `http://localhost:8180` → delete `KEYCLOAK_SESSION` (and related cookies). Next app visit will prompt login.

- **Valid Redirect URIs:** `http://localhost:5174/auth/callback`, `http://localhost:5174`, and 127.0.0.1 equivalents; plus `http://localhost:5175/*`, `http://localhost:5175`, and 127.0.0.1 equivalents (5175 when running from DevKit).
- **Valid post logout redirect URIs:** Same ports (5174, 5175) with `/` and without.

**If you see "Invalid redirect uri" on sign out** – Keycloak only imports the realm on first startup. If the realm already existed before the post-logout URIs were added, run:
```bash
./docker/keycloak/add-post-logout-uris.sh
```

See **projects/wabisaby-web/docs/KEYCLOAK_CLIENT.md** for the full list and why each is needed.

## CORS and the web app

The realm’s **Web Origins** include `http://localhost:5174`, `http://localhost:5175`, and 127.0.0.1 equivalents so the Vite dev server can call the token endpoint. When running wabisaby-web from DevKit, it uses port **5175** (5174 is reserved for the DevKit frontend). Set `VITE_KEYCLOAK_URL=http://localhost:8180` in your app env. For production, use the real Keycloak URL.

## tenant_id and user_id (API 401 "missing tenant_id")

The API requires `tenant_id` and `user_id` in the JWT. These come from Keycloak user attributes via protocol mappers on **wabisaby-web** and **wabisaby-api** clients.

**If you see 401 "missing tenant_id in token/context"** – Keycloak only imports the realm on first startup. If the realm already existed before the protocol mappers were added to `wabisaby-realm.json`, the **wabisaby-web** client won’t have them. Run:

```bash
./docker/keycloak/add-protocol-mappers.sh
```

Then run the steps below.

**To fix 401 "missing tenant_id in token/context":**

1. **Create tenant and user** in the app DB (seed or onboard):
   ```bash
   cd projects/wabisaby-core && go run ./tools/seed
   ```
   Or call `POST /api/v1/tenants/onboard` with `{ "email": "you@example.com", "tenantName": "My Tenant" }`.

2. **Set Keycloak user attributes** – either via script (recommended) or Admin UI:

   **Option A – Script (reliable):**
   ```bash
   ./docker/keycloak/set-user-attributes.sh <your-email> <tenant_id> <user_id>
   ```
   Example: `./docker/keycloak/set-user-attributes.sh joao@example.com cc74e56d-52bb-4551-b0f3-3c3688d8ed83 d053939e-0344-4612-a367-ba03f862f1ca`

   **Option B – Admin UI** (if you don't see the Attributes tab, enable it first):
   - **Realm Settings** → **General** → **Unmanaged attributes** → **Admin can edit** → Save
   - **Users** → your user → **Attributes** → Add `tenant_id` and `user_id` → Save

3. **Re-login** so the new token includes these claims.

**Note:** Keycloak only imports the realm on first startup. If the realm already exists, changes to `wabisaby-realm.json` are not applied. Use `add-protocol-mappers.sh` to add mappers to an existing realm, or wipe the Keycloak volume (`docker compose -f docker/docker-compose.yml down -v keycloak`) and restart to re-import from scratch.
