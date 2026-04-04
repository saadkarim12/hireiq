#!/bin/bash
BASE="http://localhost:3001"
AI="http://localhost:3002"
WA="http://localhost:3003"
PASS=0; FAIL=0
GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
pass() { echo -e "${GREEN}  ✓ PASS${NC} — $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ FAIL${NC} — $1"; FAIL=$((FAIL+1)); }
section() { echo -e "\n${BLUE}══ $1 ══${NC}"; }

TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/dev-login" -H "Content-Type: application/json" -d '{"email":"admin@saltrecruitment.ae"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
[ -z "$TOKEN" ] && echo "FATAL: Core API not running" && exit 1
AUTH="Authorization: Bearer $TOKEN"

section "1 — Health Checks"
curl -s "$BASE/health" | grep -q '"ok"' && pass "Core API" || fail "Core API"
curl -s "$AI/health" | grep -q '"ok"' && pass "AI Engine" || fail "AI Engine"
curl -s "$WA/health" | grep -q '"ok"' && pass "WhatsApp Service" || fail "WhatsApp Service"

section "2 — Authentication"
curl -s "$BASE/api/v1/jobs" | grep -q "UNAUTHORIZED" && pass "Unauthenticated blocked" || fail "Unauthenticated blocked"
curl -s "$BASE/api/v1/auth/me" -H "$AUTH" | grep -q '"success":true' && pass "GET /me works" || fail "GET /me works"
curl -s -X POST "$BASE/api/v1/auth/dev-login" -H "Content-Type: application/json" -d '{"email":"fake@nobody.com"}' | grep -q '"success":false' && pass "Invalid email rejected" || fail "Invalid email rejected"

section "3 — Jobs API"
R=$(curl -s "$BASE/api/v1/jobs" -H "$AUTH")
echo "$R" | grep -q '"success":true' && pass "List jobs" || fail "List jobs"
JOB_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
curl -s "$BASE/api/v1/jobs/$JOB_ID" -H "$AUTH" | grep -q '"success":true' && pass "Get single job" || fail "Get single job"
curl -s "$BASE/api/v1/jobs/$JOB_ID/pipeline" -H "$AUTH" | grep -q '"success":true' && pass "Pipeline counts" || fail "Pipeline counts"
curl -s "$BASE/api/v1/jobs/$JOB_ID/shortlist" -H "$AUTH" | grep -q '"success":true' && pass "Get shortlist" || fail "Get shortlist"
R=$(curl -s "$BASE/api/v1/jobs/$JOB_ID/candidates" -H "$AUTH")
echo "$R" | grep -q '"success":true' && pass "Get candidates for job" || fail "Get candidates for job"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
[ "$COUNT" -gt "0" ] 2>/dev/null && pass "Demo candidates present ($COUNT)" || fail "Demo candidates present"

section "4 — Candidates API"
curl -s "$BASE/api/v1/candidates" -H "$AUTH" | grep -q '"success":true' && pass "Talent pool search" || fail "Talent pool search"
CAND_ID=$(curl -s "$BASE/api/v1/jobs/$JOB_ID/candidates" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
curl -s "$BASE/api/v1/candidates/$CAND_ID" -H "$AUTH" | grep -q '"success":true' && pass "Get candidate profile" || fail "Get candidate profile"
curl -s "$BASE/api/v1/candidates/$CAND_ID" -H "$AUTH" | grep -q '"compositeScore"' && pass "Scores present" || fail "Scores present"
curl -s "$BASE/api/v1/candidates/$CAND_ID/transcript" -H "$AUTH" | grep -q '"success":true' && pass "Get transcript" || fail "Get transcript"
curl -s -X PATCH "$BASE/api/v1/candidates/$CAND_ID/status" -H "$AUTH" -H "Content-Type: application/json" -d '{"pipelineStage":"held"}' | grep -q '"success":true' && pass "Update candidate status" || fail "Update candidate status"

section "5 — Analytics API"
curl -s "$BASE/api/v1/analytics/dashboard-kpis" -H "$AUTH" | grep -q '"success":true' && pass "Dashboard KPIs" || fail "Dashboard KPIs"
curl -s "$BASE/api/v1/analytics/overview?from=2026-01-01&to=2026-12-31" -H "$AUTH" | grep -q '"success":true' && pass "Analytics overview" || fail "Analytics overview"
curl -s "$BASE/api/v1/analytics/timeline?from=2026-01-01&to=2026-12-31" -H "$AUTH" | grep -q '"success":true' && pass "Timeline" || fail "Timeline"
curl -s "$BASE/api/v1/analytics/score-distribution" -H "$AUTH" | grep -q '"success":true' && pass "Score distribution" || fail "Score distribution"
curl -s "$BASE/api/v1/analytics/jobs" -H "$AUTH" | grep -q '"success":true' && pass "Jobs analytics" || fail "Jobs analytics"

section "6 — WhatsApp Flow"
SHORTCODE=$(curl -s "$BASE/api/v1/jobs" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['waShortcode'])" 2>/dev/null)
AGENCY_ID=$(curl -s "$BASE/api/v1/auth/me" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['agencyId'])" 2>/dev/null)
PHONE="+971509990001"
curl -s -X POST "$WA/mock/simulate" -H "Content-Type: application/json" -d "{\"waNumber\":\"$PHONE\",\"message\":\"APPLY $SHORTCODE\",\"agencyId\":\"$AGENCY_ID\",\"agencyName\":\"Salt Recruitment\",\"jobShortcode\":\"$SHORTCODE\"}" | grep -q '"success":true' && pass "WA: Initiate conversation" || fail "WA: Initiate conversation"
curl -s -X POST "$WA/mock/simulate" -H "Content-Type: application/json" -d "{\"waNumber\":\"$PHONE\",\"message\":\"2\",\"agencyId\":\"$AGENCY_ID\",\"agencyName\":\"Salt Recruitment\"}" | grep -q '"success":true' && pass "WA: Language selection" || fail "WA: Language selection"
curl -s -X POST "$WA/mock/simulate" -H "Content-Type: application/json" -d "{\"waNumber\":\"$PHONE\",\"message\":\"YES\",\"agencyId\":\"$AGENCY_ID\",\"agencyName\":\"Salt Recruitment\"}" | grep -q '"success":true' && pass "WA: Consent" || fail "WA: Consent"
curl -s -X POST "$WA/mock/simulate" -H "Content-Type: application/json" -d "{\"waNumber\":\"$PHONE\",\"message\":\"8 years finance experience in UAE real estate\",\"agencyId\":\"$AGENCY_ID\",\"agencyName\":\"Salt Recruitment\"}" | grep -q '"success":true' && pass "WA: Answer Q1" || fail "WA: Answer Q1"

section "7 — Security"
curl -s "$BASE/api/v1/jobs" -H "Authorization: Bearer invalid.token" | grep -q '"INVALID_TOKEN"\|"UNAUTHORIZED"' && pass "Invalid JWT rejected" || fail "Invalid JWT rejected"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  / $((PASS+FAIL)) total"
[ "$FAIL" -eq 0 ] && echo -e "  ${GREEN}✅ ALL PASSED — Ready for Phase 7${NC}" || echo -e "  ${RED}❌ ${FAIL} failed — fixing needed${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
