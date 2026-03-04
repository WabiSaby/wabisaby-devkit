#!/usr/bin/env bash
# Add Valid Post Logout Redirect URIs to the wabisaby-web client via Keycloak Admin API.
# Use this when the realm was created before these URIs were added to wabisaby-realm.json.
# Keycloak only imports realms on first startup; existing realms are NOT updated from the JSON.
#
# Usage: ./add-post-logout-uris.sh

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
CLIENT_ID="${CLIENT_ID:-wabisaby-web}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

# Same URIs as in wabisaby-realm.json (with and without trailing slash)
POST_LOGOUT_URIS="http://localhost:5174##http://localhost:5174/##http://localhost:5175##http://localhost:5175/##http://127.0.0.1:5174##http://127.0.0.1:5174/##http://127.0.0.1:5175##http://127.0.0.1:5175/"

if ! command -v jq &> /dev/null; then
  echo "jq is required. Install with: brew install jq"
  exit 1
fi

echo "Adding post logout redirect URIs to client $CLIENT_ID..."

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

# Get full client representation
CLIENT_JSON=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Check if post.logout.redirect.uris already has the correct value
CURRENT_URIS=$(echo "$CLIENT_JSON" | jq -r '.attributes["post.logout.redirect.uris"] // empty')
if [ "$CURRENT_URIS" = "$POST_LOGOUT_URIS" ]; then
  echo "Post logout redirect URIs already configured correctly. Nothing to do."
  exit 0
fi

# Merge post.logout.redirect.uris into attributes for PUT
PUT_BODY=$(echo "$CLIENT_JSON" | jq --arg uris "$POST_LOGOUT_URIS" '
  .attributes = ((.attributes // {}) | .["post.logout.redirect.uris"] = $uris)
')

HTTP_CODE=$(curl -s -o /tmp/kc-post-logout.txt -w "%{http_code}" -X PUT \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PUT_BODY")

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "Post logout redirect URIs updated successfully."
  echo "Sign out should now work without 'Invalid redirect uri'."
else
  echo "Failed to update client (HTTP $HTTP_CODE). Response:"
  cat /tmp/kc-post-logout.txt | jq . 2>/dev/null || cat /tmp/kc-post-logout.txt
  exit 1
fi
