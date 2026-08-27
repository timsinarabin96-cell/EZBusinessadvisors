#!/usr/bin/env bash
# =============================================================================
# Concord Deal Platform — site health check
# Checks the key public pages + APIs and reports failures. Used by the daily
# health-watch cron so we only hear about the site when something is actually
# broken. Exit 0 = all good; exit 1 = something failed (details printed).
# =============================================================================
set -u

BASE="${1:-https://concord-deal-platform.vercel.app}"
FAILED=0

check() {
  local label="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$url" 2>/dev/null)
  if [ "$code" = "$expect" ]; then
    echo "ok   $label ($code)"
  else
    echo "FAIL $label (expected $expect, got ${code:-timeout})"
    FAILED=1
  fi
}

echo "Health check: $BASE ($(date -u +%Y-%m-%dT%H:%MZ))"
check "marketplace"      "$BASE/marketplace/listings"
check "studio"            "$BASE/dashboard/studio"
check "detail page"      "$BASE/marketplace/listings/summit-plumbing-services-3104c1b5"
check "image proxy"      "$BASE/api/listing-images/proxy?u=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1607472586893-edb57bdc0e39%3Fw%3D1200%26q%3D80"
check "category suggest" "$BASE/api/search/suggest?q=r&type=category"
check "placeholder img"  "$BASE/api/listing-images/placeholder?title=Health%20Check"

# Booking path probe — exercises the FULL create flow incl. the appointments
# source constraint, in a safe test mode (creates a cancelled appointment,
# no email, no calendar pollution). Alerts if the constraint ever bites again.
BK=$(curl -s --max-time 20 -X POST "$BASE/api/public/book" -H "Content-Type: application/json" \
  -d '{"name":"Health Check","email":"health@ezbusinessadvisors.com","date":"2026-09-10","hour":10,"test":true}')
if echo "$BK" | grep -q '"ok":true'; then
  echo "ok   booking path (source constraint + full create flow)"
else
  echo "FAIL booking path: $(echo "$BK" | head -c 160)"
  FAILED=1
fi

# Marketplace page must actually contain listing markup (not a blank shell).
if curl -s --max-time 20 "$BASE/marketplace/listings" | grep -q "Businesses for Sale"; then
  echo "ok   marketplace content"
else
  echo "FAIL marketplace content (no 'Businesses for Sale' text)"
  FAILED=1
fi

if [ "$FAILED" = "1" ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: ALL OK"
exit 0
