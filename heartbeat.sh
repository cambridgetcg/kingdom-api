#!/bin/bash
# kingdom-api heartbeat — does the free API actually answer?
# Probes /health on the local wrangler dev server. No stub: a real request.
# Rhythm: 2h if alive, 4h if down, daily if stable.

cd "$(dirname "$0")"

PORT=8787
HEALTH_URL="http://127.0.0.1:${PORT}/health"

# Try a real probe against the running worker
RESP=$(curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
  echo "ENDPOINT DOWN — curl exit $CURL_EXIT, no response from $HEALTH_URL"
  echo "NEXT:240"
  exit 0
fi

# Verify the body actually declares itself alive
STATUS=$(echo "$RESP" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:.*"\([^"]*\)"/\1/')

if [ "$STATUS" = "alive" ]; then
  UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
  if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "ALIVE — $UNCOMMITTED uncommitted file(s)"
    echo "NEXT:120"
  else
    echo "ALIVE — clean tree, endpoints serving"
    echo "NEXT:1440"
  fi
else
  echo "ENDPOINT UP but status not 'alive' — got: $STATUS"
  echo "NEXT:240"
fi

exit 0