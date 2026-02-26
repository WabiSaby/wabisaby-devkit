#!/usr/bin/env bash
# Request a token for the node user. Prints the token or the full error from Keycloak.
# Usage:
#   ./get-node-token.sh [username] [password]        # print access_token only
#   ./get-node-token.sh --env [username] [password]  # print .env lines including refresh_token (for programmatic refresh)
# Default: node / node

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${REALM:-wabisaby}"
TOKEN_URL="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"

OUTPUT_ENV=false
if [ "${1:-}" = "--env" ]; then
  OUTPUT_ENV=true
  shift
fi
USERNAME="${1:-node}"
PASSWORD="${2:-node}"

RESPONSE=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=wabisaby-api" \
  -d "username=${USERNAME}" \
  -d "password=${PASSWORD}")

if command -v jq >/dev/null 2>&1; then
  if echo "$RESPONSE" | jq -e '.access_token' >/dev/null 2>&1; then
    if [ "$OUTPUT_ENV" = true ]; then
      REFRESH=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')
      if [ -n "$REFRESH" ] && [ "$REFRESH" != "null" ]; then
        echo "# Paste into .env for automatic token refresh (node refreshes before expiry):"
        echo "WABISABY_NODE_AUTH_REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token')"
        echo "WABISABY_NODE_KEYCLOAK_TOKEN_URL=$TOKEN_URL"
      else
        echo "# No refresh_token in response; paste access token (will expire):"
        echo "WABISABY_NODE_AUTH_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')"
      fi
    else
      echo "$RESPONSE" | jq -r '.access_token'
    fi
    exit 0
  fi
  echo "Keycloak returned an error (no access_token):"
  echo "$RESPONSE" | jq .
  exit 1
fi

# No jq: try to extract access_token or show raw response
if echo "$RESPONSE" | grep -q '"access_token"'; then
  if [ "$OUTPUT_ENV" = true ]; then
    echo "WABISABY_NODE_AUTH_TOKEN=..."
    echo "# (install jq for refresh_token + keycloak URL output)"
  else
    echo "$RESPONSE" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
  fi
  exit 0
fi
echo "Keycloak returned an error (no access_token):"
echo "$RESPONSE"
exit 1