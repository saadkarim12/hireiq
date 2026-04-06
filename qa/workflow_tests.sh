#!/bin/bash
BASE="http://localhost:3001"
AI="http://localhost:3002"
WA="http://localhost:3003"
PASS=0; FAIL=0
GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}  ✓ PASS${NC} — $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ FAIL${NC} — $1 | $2"; FAIL=$((FAIL+1)); }
section() { echo -e "\n${BLUE}━━ $1 ━━${NC}"; }
info() { echo -e "${YELLOW}  ℹ  $1${NC}"; }

TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/dev-login" -H "Content-Type: application/json" -d '{"email":"admin@saltrecruitment.ae"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
[ -z "$TOKEN" ] && echo -e "${RED}FATAL: Cannot get token. Are services running?${NC}" && exit 1
AUTH="Authorization: Bearer $TOKEN"
AGENCY_ID=$(curl -s "$BASE/api/v1/auth/me" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['agencyId'])" 2>/dev/null)

# Unique phone per test run to avoid candidate session conflicts
PHONE="+97150$(date +%s | tail -c 7)"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     HireIQ Full Workflow Test Suite      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo -e "  Test phone: $PHONE"

section "Suite 1 — Service Health"
curl -s "$BASE/health" | grep -q '"ok"' && pass "Core API :3001" || fail "Core API :3001" "not responding"
curl -s "$AI/health"   | grep -q '"ok"' && pass "AI Engine :3002" || fail "AI Engine :3002" "not responding"
curl -s "$WA/health"   | grep -q '"ok"' && pass "WhatsApp :3003" || fail "WhatsApp :3003" "not responding"

section "Suite 2 — Job Creation"
R=$(curl -s -X POST "$BASE/api/v1/jobs" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "title":"Workflow Test — Finance Manager","hiringCompany":"Test Corp",
  "locationCountry":"AE","locationCity":"Dubai","employmentType":"permanent",
  "jobType":"hybrid","currency":"AED","salaryMin":20000,"salaryMax":35000,
  "visaRequirement":"residence_visa","nationalityPref":"any","minExperienceYears":5,
  "requiredLanguages":["English","Arabic"],"requiredSkills":["IFRS","Financial Modeling","Excel"],
  "preferredSkills":["Power BI","CFA"],"mustHaveSkills":["IFRS","Financial Modeling"],
  "niceToHaveSkills":["Power BI"],"autoApproveThreshold":75,"autoRejectThreshold":40,
  "jdText":"We are looking for a Finance Manager with minimum 5 years experience in financial analysis and IFRS reporting. The role involves preparing monthly financial reports, managing budget process, and presenting insights to senior leadership. Must have strong Excel and financial modeling skills. UAE real estate experience preferred."
}')
echo "$R" | grep -q '"success":true' && pass "Create job" || fail "Create job" "$(echo $R | head -c 150)"
TEST_JOB_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
TEST_SHORTCODE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['waShortcode'])" 2>/dev/null)
[ -n "$TEST_JOB_ID" ] && pass "Job ID: ${TEST_JOB_ID:0:8}..." || fail "Job ID" "not returned"
[ -n "$TEST_SHORTCODE" ] && pass "Shortcode: $TEST_SHORTCODE" || fail "Shortcode" "not generated"

info "Waiting for AI questions (up to 30s)..."
for i in $(seq 1 6); do
  sleep 5
  Q=$(curl -s "$BASE/api/v1/jobs/$TEST_JOB_ID" -H "$AUTH" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data'].get('screeningQuestions') or []))" 2>/dev/null)
  [ "${Q:-0}" -gt "0" ] 2>/dev/null && break
done
[ "${Q:-0}" -gt "0" ] && pass "AI generated $Q questions" || fail "AI questions" "0 — check API key"

R=$(curl -s -X POST "$BASE/api/v1/jobs/$TEST_JOB_ID/activate" -H "$AUTH")
echo "$R" | grep -q '"success":true' && pass "Job activated" || fail "Job activation" ""

section "Suite 3 — WhatsApp Screening Flow"
sim() {
  local label=$1 msg=$2 sc=$3
  local body="{\"waNumber\":\"$PHONE\",\"message\":\"$msg\",\"agencyId\":\"$AGENCY_ID\",\"agencyName\":\"Salt Recruitment\""
  [ -n "$sc" ] && body="$body,\"jobShortcode\":\"$sc\""
  body="$body}"
  R=$(curl -s -X POST "$WA/mock/simulate" -H "Content-Type: application/json" -d "$body")
  echo "$R" | grep -q '"success":true' && pass "WA: $label" || fail "WA: $label" "$(echo $R | head -c 80)"
  sleep 1
}
sim "initiate"  "APPLY $TEST_SHORTCODE"  "$TEST_SHORTCODE"
sim "language"  "2"
sim "consent"   "YES"
sim "Q1"        "I have 8 years finance experience in UAE real estate and banking"
sim "Q2"        "I hold CPA and have managed IFRS compliance for listed UAE companies"
sim "Q3"        "My salary expectation is AED 28000 per month"
sim "Q4"        "My notice period is 30 days and I can join in May"
sim "Q5"        "I am interested because of DAMAC growth pipeline and Vision 2030 alignment"
sim "no cv"     "NO CV"

section "Suite 4 — Candidate Record"
sleep 2
R=$(curl -s "$BASE/api/v1/jobs/$TEST_JOB_ID/candidates" -H "$AUTH")
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
[ "${COUNT:-0}" -gt "0" ] && pass "Candidate in DB ($COUNT found)" || fail "Candidate in DB" "0 found — WhatsApp may not have created record"
CAND_ID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$CAND_ID" ]; then
  curl -s "$BASE/api/v1/candidates/$CAND_ID" -H "$AUTH" | grep -q '"success":true' && pass "Candidate profile accessible" || fail "Candidate profile" ""
  MSG_COUNT=$(curl -s "$BASE/api/v1/candidates/$CAND_ID/transcript" -H "$AUTH" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['messages']))" 2>/dev/null)
  [ "${MSG_COUNT:-0}" -gt "3" ] && pass "Transcript ($MSG_COUNT messages)" || fail "Transcript" "got $MSG_COUNT"
fi

section "Suite 5 — AI Scoring"
if [ -n "$CAND_ID" ]; then
  R=$(curl -s -X POST "$AI/api/v1/ai/score" -H "Content-Type: application/json" -d "{\"candidateId\":\"$CAND_ID\",\"jobId\":\"$TEST_JOB_ID\"}")
  echo "$R" | grep -q '"success":true' && pass "AI scoring completed" || fail "AI scoring" "$(echo $R | head -c 200)"
  sleep 2
  R=$(curl -s "$BASE/api/v1/candidates/$CAND_ID" -H "$AUTH")
  SCORE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('compositeScore','null'))" 2>/dev/null)
  [ "$SCORE" != "null" ] && [ "$SCORE" != "None" ] && pass "Composite score: $SCORE/100" || fail "Score" "null"
  EVIDENCE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('yes' if d.get('dataTags',{}).get('evidence') else 'no')" 2>/dev/null)
  [ "$EVIDENCE" = "yes" ] && pass "Evidence layer populated" || fail "Evidence layer" "empty"
fi

section "Suite 6 — Analytics"
curl -s "$BASE/api/v1/analytics/dashboard-kpis" -H "$AUTH" | grep -q '"success":true' && pass "Dashboard KPIs" || fail "KPIs" ""
curl -s "$BASE/api/v1/analytics/overview?from=2026-01-01&to=2026-12-31" -H "$AUTH" | grep -q '"success":true' && pass "Analytics overview" || fail "Analytics" ""
curl -s "$BASE/api/v1/jobs/$TEST_JOB_ID/pipeline" -H "$AUTH" | grep -q '"success":true' && pass "Pipeline counts" || fail "Pipeline" ""

section "Suite 7 — Returning Candidate"
if [ -n "$CAND_ID" ]; then
  R=$(curl -s "$BASE/api/v1/candidates/$CAND_ID/cv-diff" -H "$AUTH")
  echo "$R" | grep -q '"success":true' && pass "CV diff endpoint" || fail "CV diff" "$(echo $R | head -c 100)"
fi

section "Suite 8 — Security"
curl -s "$BASE/api/v1/jobs" | grep -q '"UNAUTHORIZED"' && pass "Unauthenticated blocked" || fail "Auth check" ""
curl -s "$BASE/api/v1/jobs" -H "Authorization: Bearer fake.token" | grep -q '"INVALID_TOKEN"\|"UNAUTHORIZED"' && pass "Invalid JWT rejected" || fail "Invalid JWT" ""

TOTAL=$((PASS+FAIL))
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ "$FAIL" -eq 0 ] && echo -e "  ${GREEN}✅ ALL $TOTAL TESTS PASSED — Ready for Phase 7${NC}" || echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  / $TOTAL total"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ -n "$TEST_JOB_ID" ] && echo "  Job: $TEST_JOB_ID"
[ -n "$CAND_ID" ]     && echo "  Candidate: $CAND_ID"
echo ""
