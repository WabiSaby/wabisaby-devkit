#!/usr/bin/env bash
# Set tenant_id and user_id attributes on a Keycloak user via Admin API.
# Usage: ./set-user-attributes.sh <username> <tenant_id> <user_id>
# Example: ./set-user-attributes.sh admin@example.com cc74e56d-52bb-4551-b0f3-3c3688d8ed83 d053939e-0344-4612-a367-ba03f862f1ca
#
# Get tenant_id and user_id from: cd projects/wabisaby-core && go run ./tools/seed

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

if [ $# -lt 3 ]; then
  echo "Usage: $0 <username> <tenant_id> <user_id>"
  echo "Example: $0 admin@example.com cc74e56d-52bb-4551-b0f3-3c3688d8ed83 d053939e-0344-4612-a367-ba03f862f1ca"
  echo ""
  echo "Get tenant_id and user_id from: cd projects/wabisaby-core && go run ./tools/seed"
  exit 1
fi

USERNAME="$1"
TENANT_ID="$2"
USER_ID="$3"

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

# Find user by username or email
USER_JSON=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}&exact=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$(echo "$USER_JSON" | jq length)" -eq 0 ]; then
  USER_JSON=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?search=${USERNAME}" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
fi

# If still not found, try email as search (some realms use email as username)
if [ "$(echo "$USER_JSON" | jq length)" -eq 0 ] && [[ "$USERNAME" == *"@"* ]]; then
  USER_JSON=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${USERNAME}&exact=true" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
fi

USER_UUID=$(echo "$USER_JSON" | jq -r '.[0].id // empty')
if [ -z "$USER_UUID" ] || [ "$USER_UUID" = "null" ]; then
  echo "User not found: $USERNAME"
  echo "Available users (first 5):"
  curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?max=5" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[].username'
  exit 1
fi

# Get current user and merge attributes (Keycloak attributes are arrays: {"key": ["value"]})
USER_BODY=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_UUID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
USER_BODY=$(echo "$USER_BODY" | jq --arg tid "$TENANT_ID" --arg uid "$USER_ID" \
  '.attributes = ((.attributes // {}) | .tenant_id = [$tid] | .user_id = [$uid])')

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_UUID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$USER_BODY" > /dev/null

echo "Set tenant_id=$TENANT_ID and user_id=$USER_ID on user $USERNAME (id=$USER_UUID)"
echo "Re-login to get a new token with these claims."
