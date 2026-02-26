#!/usr/bin/env bash
# Creates a Keycloak user for the node (firstName/lastName set so direct grant works).
# Usage: ./create-node-user.sh [username] [password]   (default: node / node)
# Requires: Keycloak running, jq

set -e
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
USERNAME="${1:-node}"
PASSWORD="${2:-node}"

ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" -d "password=${ADMIN_PASS}" | jq -r '.access_token')
[ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ] && { echo "Failed to get admin token."; exit 1; }

EXISTING=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}&exact=true" -H "Authorization: Bearer ${ADMIN_TOKEN}")
[ "$(echo "$EXISTING" | jq 'length')" -gt 0 ] && { echo "User '${USERNAME}' exists. Fix with: ./fix-node-user.sh ${USERNAME}"; exit 1; }

EMAIL="${USERNAME}@local.dev"
CREATE=$(jq -n --arg u "$USERNAME" --arg e "$EMAIL" \
  '{ username: $u, email: $e, emailVerified: true, enabled: true, requiredActions: [], firstName: "Node", lastName: "Service" }')
HTTP_CODE=$(curl -s -o /tmp/kc-create.txt -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" -d "$CREATE")
[ "$HTTP_CODE" -ge 400 ] && { echo "Create failed:"; cat /tmp/kc-create.txt; exit 1; }

USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}&exact=true" -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id')
curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"type\":\"password\",\"value\":\"${PASSWORD}\",\"temporary\":false}" >/dev/null

# Ensure profile is fully set (Keycloak 24+)
UPDATE=$(jq -n --arg e "$EMAIL" '{ requiredActions: [], emailVerified: true, email: $e, firstName: "Node", lastName: "Service" }')
curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" -d "$UPDATE" >/dev/null

echo "Created user '${USERNAME}'. Get token: ./get-node-token.sh --env ${USERNAME} ${PASSWORD}"
