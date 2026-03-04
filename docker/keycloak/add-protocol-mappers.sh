#!/usr/bin/env bash
# Add tenant_id and user_id protocol mappers to the wabisaby-web client via Keycloak Admin API.
# Use this when the realm was created before these mappers were added to wabisaby-realm.json.
# Keycloak only imports realms on first startup; existing realms are NOT updated from the JSON.
#
# Usage: ./add-protocol-mappers.sh

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
CLIENT_ID="${CLIENT_ID:-wabisaby-web}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

if ! command -v jq &> /dev/null; then
  echo "jq is required. Install with: brew install jq"
  exit 1
fi

echo "Adding tenant_id and user_id protocol mappers to client $CLIENT_ID..."

# Get admin token from master realm
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" | jq -r '.access_token // empty')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "Failed to get admin token. Is Keycloak running at $KEYCLOAK_URL?"
  exit 1
fi

# Get client by clientId (returns internal UUID)
CLIENT_UUID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id // empty')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
  echo "Client $CLIENT_ID not found in realm $REALM."
  exit 1
fi

# Get existing protocol mappers
EXISTING_MAPPERS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
HAS_TENANT=$(echo "$EXISTING_MAPPERS" | jq -r '.[] | select(.name == "tenant_id") | .name' | head -1)
HAS_USER=$(echo "$EXISTING_MAPPERS" | jq -r '.[] | select(.name == "user_id") | .name' | head -1)

if [ -n "$HAS_TENANT" ] && [ -n "$HAS_USER" ]; then
  echo "Protocol mappers tenant_id and user_id already exist on $CLIENT_ID. Nothing to do."
  exit 0
fi

add_mapper() {
  local name="$1"
  local attr="$2"
  if [ -n "$(echo "$EXISTING_MAPPERS" | jq -r --arg n "$name" '.[] | select(.name == $n) | .name')" ]; then
    echo "  $name mapper already exists, skipping."
    return
  fi
  local payload=$(jq -n \
    --arg name "$name" \
    --arg attr "$attr" \
    '{
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "name": $name,
      "config": {
        "user.attribute": $attr,
        "claim.name": $attr,
        "jsonType.label": "String",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true"
      }
    }')
  if curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" > /dev/null; then
    echo "  Added $name mapper."
  else
    echo "  Failed to add $name mapper."
    exit 1
  fi
}

add_mapper "tenant_id" "tenant_id"
add_mapper "user_id" "user_id"

echo "Done. Re-login to get a new token with tenant_id and user_id claims."
echo "Then run: ./docker/keycloak/set-user-attributes.sh <your-email> <tenant_id> <user_id>"
