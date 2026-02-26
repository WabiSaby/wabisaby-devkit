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

Requires **jq** (e.g. `brew install jq`).
