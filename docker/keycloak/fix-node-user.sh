#!/usr/bin/env bash
# Fixes a Keycloak user so "Account is not fully set up" is cleared (required actions, firstName/lastName, email).
# Usage: ./fix-node-user.sh [username]   (default: node)
# Requires: Keycloak running, jq

set -e
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
USERNAME="${1:-node}"

ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" -d "password=${ADMIN_PASS}" | jq -r '.access_token')
[ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ] && { echo "Failed to get admin token."; exit 1; }

USER_JSON=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")
USER_ID=$(echo "$USER_JSON" | jq -r '.[0].id')
[ -z "$USER_ID" ] || [ "$USER_ID" = "null" ] && { echo "User '${USERNAME}' not found. Create with ./create-node-user.sh first."; exit 1; }

EMAIL=$(echo "$USER_JSON" | jq -r '.[0].email // empty')
[ -z "$EMAIL" ] && EMAIL="${USERNAME}@local.dev"
PAYLOAD=$(jq -n --arg e "$EMAIL" '{ requiredActions: [], emailVerified: true, email: $e, firstName: "Node", lastName: "Service" }')

HTTP_CODE=$(curl -s -o /tmp/kc-fix.txt -w "%{http_code}" -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" -d "$PAYLOAD")
[ "$HTTP_CODE" -ge 400 ] && { echo "Update failed (HTTP $HTTP_CODE):"; cat /tmp/kc-fix.txt; exit 1; }

echo "Fixed user '${USERNAME}'. Get token: ./get-node-token.sh --env ${USERNAME} <password>"
