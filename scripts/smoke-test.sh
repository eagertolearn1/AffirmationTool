#!/usr/bin/env bash
# Quick smoke test against a running local backend
# Usage: ./scripts/smoke-test.sh [BASE_URL]
# Default: http://localhost:3001

BASE=${1:-http://localhost:3001}
PASS=0
FAIL=0

check() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"

  if [ "$actual_status" = "$expected_status" ]; then
    echo "  ✅  $label → $actual_status"
    PASS=$((PASS+1))
  else
    echo "  ❌  $label → got $actual_status (expected $expected_status)"
    echo "      $body"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "🔍  Smoke-testing $BASE"
echo "────────────────────────────────────"

# 1. Health
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
check "GET /health" "200" "$STATUS"

# 2. Auth — signup (expect 200 or 409 if already exists)
BODY=$(curl -s -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"smoketest@example.com","age_confirmed":true}')
STATUS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('statusCode',200))" 2>/dev/null || echo "200")
echo "  ℹ️   POST /api/auth/signup → check email for OTP"

# 3. Login
BODY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com"}')
check "POST /api/auth/login" "200" "$BODY"

# 4. 404 on unknown route
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/does-not-exist")
check "GET /api/unknown → 404" "404" "$STATUS"

# 5. Auth required on protected route
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/journey/current")
check "GET /api/journey/current (no token) → 401" "401" "$STATUS"

# 6. Admin blocked for non-admin
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/metrics")
check "GET /api/admin/metrics (no token) → 401" "401" "$STATUS"

echo "────────────────────────────────────"
echo "  Passed: $PASS  Failed: $FAIL"
echo ""

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
