# QA Fix Log — HireIQ v1.10.0

Running log of QA findings (from `HireIQ_QA_Test_Plan_v1.2.docx`) worked through 1-by-1 with Saad, with agreed fixes for each. Implementation happens in sprints; this doc is the source-of-truth for "what are we actually fixing".

Legend:
- **Status**: `agreed` (plan locked, ready to implement) · `in progress` · `shipped` (link to commit) · `deferred` (reason given)
- **Effort**: rough engineering time, not including QA retest

---

## Test 1.1 — Navigate (QA rating: Partial)

Saad's notes captured two separate observations. Treated as two distinct fixes:

### 1.1.a — Replace generic globe favicon with HireIQ logo
- **Issue**: Browser tab shows the default globe favicon, not a branded mark.
- **Fix**: Add a proper favicon in `frontend/src/app/` (Next.js serves `favicon.ico` / `icon.png` in this directory automatically across every route). Source art: HireIQ "IQ" gold-on-navy logo, 512×512 PNG or SVG.
- **Blocked on**: logo file from Saad.
- **Effort**: 10 min.
- **Status**: agreed.

### 1.1.b — Sidebar "Loading..." label never resolves
- **Issue**: Sidebar header under the "HireIQ" brand sits on `"Loading..."` forever.
- **Root cause**: `Sidebar.tsx:38` hardcodes the dev session as `{ user: { name: '...' }, agency: { name: '...' } }` — no `agencyId`. Line 50 checks `session?.user?.agencyId` and always falls through to `"Loading..."`.
- **Fix**: Drop the conditional entirely. The dev session is a stub; always show `"Agency Platform"`. When real auth ships we revisit.
- **Effort**: 5 min.
- **Status**: agreed.

### 1.1.c — (Optional nice-to-have) Per-page `<title>` tags
- **Issue**: Tabs all read `"HireIQ"`, making multi-tab workflows hard.
- **Fix**: Add `metadata.title` to each page's layout so tabs read e.g. `"Analytics — HireIQ"` / `"Pipeline — Cloud Architect — HireIQ"`.
- **Effort**: 30 min.
- **Status**: deferred (not a QA finding, nice-to-have).

---

## Test 2.3 — Job Creation Wizard / Step 1 (QA rating: Partial)

Saad's note: *"Country: It shows UK and Ksa which was in original design. It need to be removed."* — clarified to mean **UK and USA** (KSA stays, it's a core target market).

### 2.3.a — Remove out-of-scope countries from the wizard dropdown
- **Issue**: Country selector offers `GB (UK)` and `US (USA)`. HireIQ's target market is UAE + KSA + wider GCC; UK and USA aren't supported.
- **Decision (Option A)**: Keep all six GCC countries — UAE, Saudi Arabia, Bahrain, Kuwait, Qatar, Oman. Remove UK and USA only. Rationale: Bahrain/Kuwait/Qatar/Oman currencies (BHD/KWD/QAR/OMR) were just added to the Currency enum two days ago (commit `4903e31`), signalling real demand in those markets.
- **Fix**: Delete the `GB` and `US` entries from the `COUNTRIES` array in `frontend/src/app/(dashboard)/jobs/new/page.tsx:69-76`.
- **Effort**: 2 min.
- **Status**: agreed.

---

## Test 2.4 — Job Creation Wizard / Step 2 JD (QA rating: Partial)

Saad's note: *"By default.. Paste JD should appear and AI Builder come on right side so that If someone wants to use he can click on it."*

### 2.4.a — Flip default to Paste JD, swap tab order
- **Issue**: Step 2 defaults to AI Builder (5-question form). Most recruiters evaluating HireIQ already have a JD; forcing them through the form adds friction at the first impression. The real product wedges (screening questions, CV parsing, WhatsApp screening, scoring) demonstrate themselves later in the flow — the JD builder is nice but not the wedge.
- **Fix**: In `frontend/src/app/(dashboard)/jobs/new/page.tsx`: change default `jdMode: 'builder'` → `'paste'` (line 159). Swap the tab order so `📋 Paste JD` renders first (left), `✨ AI Builder` second (right) (lines 487-496). Default visual scan lands on Paste.
- **Effort**: 5 min.
- **Status**: agreed.

### 2.4.b — (Optional) Discovery hint for AI Builder
- **Issue**: If Paste becomes default, recruiters without a JD in hand might miss the AI Builder tab.
- **Fix**: Add a small helper line under the Paste textarea: *"Don't have a JD yet? Use AI Builder →"* linking to the AI tab.
- **Effort**: 10 min.
- **Status**: pending decision (not explicitly approved — ship with 2.4.a if we want the polish, drop if not).

---

## Test 2.5 — Job Creation Wizard / Step 3 Screening Criteria (QA rating: Partial)

Saad's note: *"Auto-approve – WhatsApp immediately. Word immediately is slightly misleading as recruiter can still approve or reject like for others. We can color code it but let recruiter to decide …. Am I correct"*

Saad is correct, and the issue is deeper than copy. Investigation showed the threshold block in Step 3 (`jobs/new/page.tsx:660-695`) has two problems:

**1. Copy contradicts current product behaviour.** Since Phase 6j (v1.7.0) every stage transition requires the recruiter's Approve-to-Lx click. There is no auto-approve, no auto-reject, no rejection emails fired without recruiter action. The "Auto-approve / WhatsApp immediately" and "Auto-reject / Rejection email sent" copy describes a product behaviour we deleted.

**2. The threshold inputs are dead.** Traced through the pipeline:
- Wizard submits `autoApproveThreshold` + `autoRejectThreshold` in the POST body
- `routes/jobs.ts:80-81` destructures the body but does NOT include these fields — silently ignored
- `schema.prisma` Job model has no columns for them
- `recommendForL1` in `shared/recommendations.ts` has hardcoded thresholds (55 for reject, 75 for advance) with no per-job override
- Result: recruiters adjust sliders that do nothing

### 2.5.a — Remove the dead threshold UI, replace with a read-only legend (Option C)
- **Decision**: Option C (from three options A=copy-fix-only, B=reframe-and-wire-through, C=remove). The sliders don't do anything today; making them work (Option B) would be a new feature ("per-job threshold tuning") that nobody's asked for. Cheapest and most honest move is to ship the truth now and defer tunability until there's real demand.
- **Fix**: In `frontend/src/app/(dashboard)/jobs/new/page.tsx:660-695`, replace the 3-box threshold UI + summary paragraph with a short read-only legend explaining AI Recommendation Bands: *"AI flags candidates as ✅ Advance (≥75), ⚠️ Hold (55-74), or ❌ Reject (<55). You decide whether to move them forward."* Drop `autoApproveThreshold` / `autoRejectThreshold` from the form schema (lines 41-42) + submit payload (line 228) since they're dead.
- **Effort**: 30 min.
- **Status**: agreed.

---

## Test 2.6 — Job Creation Wizard / Step 4 Baseline Questions (QA rating: Pass)

Saad's note: *"Can we give an option to recruiter to add custom questions"* — a feature request on a passing test. While investigating, surfaced two adjacent issues in the same UI. All three shipped as one commit.

### 2.6.a — Add "+ Add Custom Question" button
- **Issue**: Step 4 lets recruiters edit and delete AI-generated questions but not add their own. Subtitle promises the feature (*"Edit, reorder, or add your own"*) but the UI doesn't deliver.
- **Fix**: Add "+ Add Custom Question" button below the question list (around line 767 of `jobs/new/page.tsx`). On click: append a new question with `id: 'custom-<timestamp>'`, `type`: recruiter picks from dropdown (motivation / experience / salary / availability / skill_probe, default `skill_probe`), `questionTextEn`: empty + auto-focused, `questionTextAr` + `rationale`: empty. UI hides the 💡 rationale line when empty.
- **Effort**: 30 min.
- **Status**: agreed.

### 2.6.b — Drop "reorder" from the Step 4 subtitle
- **Issue**: Subtitle at line 728-730 promises *"Edit, reorder, or add your own"* but no reorder UI exists. Writing a cheque the UI doesn't cash.
- **Decision**: Drop "reorder" from the copy rather than build it. Order doesn't affect screening (all 5 questions sent as a batch to WhatsApp), so reorder has visual-preference-only value.
- **Fix**: Reword subtitle to *"Edit or add your own."*
- **Effort**: 2 min.
- **Status**: agreed.

### 2.6.c — Helper text for custom-question language limitation
- **Issue**: Custom questions added via 2.6.a are English-only. The conversation handler at `whatsapp-service/handlers/conversation.ts:369` reads `q.questionTextAr` when a candidate prefers Arabic — undefined for custom questions means an empty WhatsApp message.
- **Fix**: Add helper text under the "+ Add Question" button: *"Custom questions are English-only — candidates on Arabic get the English version."* Documents the gap without blocking the feature.
- **Follow-up (Phase 7, not today)**: auto-translate via Claude at save-time, OR conversation-handler fallback to English when Arabic is empty.
- **Effort**: 5 min.
- **Status**: agreed.

---

## Test 3.9 — CV Inbox Drawer Content (QA rating: Pass)

Saad's note: *"With email adress can we have a placeholder for whatsapp number."*

### 3.9.a — Add WhatsApp number to the Key Details grid across all drawer contexts
- **Issue**: Drawer's Key Details grid shows Email but not WhatsApp number. WhatsApp is the primary contact channel for this product; recruiters need it visible alongside Email.
- **Data path**: `candidate.waNumberEncrypted` (base64-encoded plaintext) is already in the candidate GET response. Just needs client-side decode + display.
- **Fix**: In `frontend/src/components/candidates/CandidatePanel.tsx` Key Details grid, add a "WhatsApp" field. Decode `atob(candidate.waNumberEncrypted)` at render time. Show raw international format (e.g. `+971501234567`). Placeholder `—` when empty (CV Inbox candidates usually won't have it yet — populated once WhatsApp screening runs).
- **Decision**: full number display (not masked, not click-to-reveal). Agency recruiters are the intended audience and WhatsApp is the primary contact channel.
- **Apply to all contexts**: Talent Pool, CV Inbox, Pipeline. Single fix covers all three.
- **Effort**: 15 min.
- **Status**: agreed.

---

## Test 3.10 — CV Inbox Action Buttons (QA rating: Partial)

Saad's note: *"Download CV is not there"*

Investigation showed two overlapping bugs:
1. **Button hidden by conditional** — `CandidatePanel.tsx` wraps Download CV in `{cvDownloadUrl && ...}`. CV Inbox candidates have `cvPreviewUrl` and `cvFileUrl` both null (the `bulk-upload.ts` flow uses `multer.memoryStorage()` and never persists the original PDF), so the button never renders.
2. **Click handler broken** — Even if the button rendered, `handleDownloadCV` expects `res.data.data.url` but the backend endpoint `/candidates/:id/cv-download` returns raw text bytes. Clicking would toast "CV download unavailable".

### 3.10.a — Always show Download CV + fix click handler (ship today)
- **Fix**: Remove the `{cvDownloadUrl && ...}` conditional — the backend endpoint always works because it synthesizes a text CV from `cvStructured` regardless of whether the original PDF is stored. Rewrite `handleDownloadCV` to treat the response as a blob, build an object URL, trigger a native browser download.
- **Affects**: All three drawer contexts (Talent Pool, CV Inbox, Pipeline).
- **Effort**: 15 min.
- **Status**: agreed.

### 3.10.b — Persist original PDF during CV Inbox upload (deferred to Phase 7)
- **Issue**: For CV Inbox candidates, Download returns a HireIQ-generated plain-text reconstruction instead of the original PDF with its formatting. The upload pipeline uses in-memory multer, file is GC'd after parsing.
- **Fix**: Switch `multer.memoryStorage()` → `multer.diskStorage()` with a local uploads directory (or Azure Blob for production). Set `cvFileUrl` on the candidate record. Update `/cv-download` to stream the original file when `cvFileUrl` is present; keep text synthesis as fallback.
- **Effort**: 1-2h.
- **Status**: deferred (Phase 7 — part of production-readiness / cloud storage work).

---

## Test 4.3 — Talent Pool Job Dropdown (QA rating: Fail)

Expected: *"Active jobs listed (no duplicates)."*

Investigation showed the "duplicates" are not a code bug — the backend returns all active jobs and the frontend renders them faithfully. The actual issue is DB pollution from test runs: **12 active job rows for 3 distinct job concepts** (5× "Workflow Test — Finance Manager", 5× "Enterprise Architect", 2× "Cloud Architect"). Labels all read identical to the recruiter.

### 4.3.a — Soft-delete the duplicate test jobs (one-time data cleanup)
- **Fix**: Set `status='closed'` on the older copies of each (title, hiringCompany) combo. Keep the most recent one + any older copies that have real candidate history attached (don't orphan candidates). Closed jobs are excluded from the active dropdown but remain queryable for audit/history purposes.
- **Effort**: 15 min + SQL to pick which to close.
- **Status**: agreed.

### 4.3.b — Disambiguate dropdown labels with creation date
- **Fix**: In `frontend/src/app/(dashboard)/talent-pool/page.tsx:206` and any other place the job dropdown renders (e.g. Analytics page job filter), append creation date: `"Enterprise Architect — DigyCorp · 10 Apr"`. Prevents recurrence of the "identical labels" confusion when legitimate duplicates exist in production.
- **Effort**: 5 min.
- **Status**: agreed.

### 4.3.c — DB uniqueness guard + duplicate warning in wizard (PROMOTED to Sprint 5 by Ali 2026-04-24)
- **Backend**: on job create in `routes/jobs.ts`, detect existing active `(agencyId, title, hiringCompany)` combo. Return 409 with *"A job with this title and company is already active. Duplicate?"* message. Accept explicit `allowDuplicate: true` payload field to force-create when recruiter confirms.
- **Frontend**: wizard Step 1 — on title/company blur, lightweight async check. If duplicate exists, show amber warning below the title field: *"An active '{title}' at {company} already exists. Make sure this is a distinct role before continuing."*
- **Why promoted**: cheap insurance against re-pollution of the demo environment after 4.3.a cleans the data.
- **Effort**: 1h.
- **Status**: agreed (Sprint 5).

---

## Test 4.4 — Talent Pool Match Filter Returns Irrelevant Roles (QA rating: Partial)

Saad's note: *"Filter is not working correctly. I click on the job I created during QA test and it shows Enterprise Architect and Cloud DevOps Engineer roles which are not relevant. Some are fine and some are not."*

Investigation of `GET /jobs/:jobId/talent-matches` in `bulk-upload.ts:122-198` surfaced four stacked mistakes in the matching algorithm:

1. **Required + preferred skills pooled together** (lines 152-155). Matching 1 preferred skill counts the same as matching 1 required skill. No hard gate on required.
2. **Loose string contains on full CV text** (line 166, `cvText.includes(skill.toLowerCase())`). A candidate with "DevOps" buried in an old project description still matches *"DevOps"* even if they're now a full-time Enterprise Architect.
3. **Threshold 55 is permissive.** With a 2-skill job + 1 skill matched + storedScore 75: blended = `75×0.4 + 50×0.6 = 60`, passes.
4. **`storedScore` from a different job carries over.** The 40% weight pulls in the composite from the candidate's previous application (maybe for a totally unrelated role).

### 4.4.a — Rewrite the match algorithm
- **Fix**: In `bulk-upload.ts:151-192`:
  - Split `requiredSkills` and `preferredSkills` explicitly.
  - **Hard gate**: drop candidates who match < 50% of `requiredSkills` (unless the job has none).
  - **Scoring**: `skillScore = requiredMatchPct × 70 + preferredMatchPct × 30`. No cross-job `storedScore` contamination.
  - **String match**: only search `cvSkills[]` (actual declared skills), not the raw JSON body.
- **Expected outcome**: Enterprise Architects no longer appear for Cloud Architect jobs unless they genuinely have the required cloud-architecture skills listed in their CV.
- **Effort**: 45 min.
- **Status**: agreed.

### 4.4.c — Claude-based per-job re-score (deferred to Phase 7)
- **Idea**: Run `/score-cv` for each pool candidate against the selected job. Actual AI scoring, not string match.
- **Why deferred**: ~100 Claude calls per dropdown change. Needs rate-limiting + caching infrastructure. Revisit when pgvector vector-search pipeline lands in Phase 7.
- **Effort**: ~half-day with caching.
- **Status**: deferred.

---

## Test 4.8 — Talent Pool drawer "Applied Jobs" shows no history (QA rating: Fail)

Saad's note: *"I can see only Applied Jobs with no history"*

Investigation of `CandidatePanel.tsx` showed the Job History section I wrote during yesterday's drawer unification is a stub — one hardcoded card that reads from the current candidate's own `dataTags.jobTitle` / `currentRole` fields. It never queries across applications, so it only ever shows one row (the current one). Additionally the section label "Applied Jobs" reads ambiguously (stage-filter vs application-history).

### 4.8.a — Rename section label
- **Fix**: In `frontend/src/components/candidates/CandidatePanel.tsx` (Talent Pool job-history block), change the `"Applied Jobs"` heading to `"Application History"`. Removes the stage-vs-history ambiguity.
- **Effort**: 2 min.
- **Status**: agreed.

### 4.8.b — Implement real application-history query
- **Backend**: new endpoint `GET /api/v1/candidates/:id/history`. Returns all candidates sharing `waNumberHash` OR `email` with the current one, scoped to the same agency, excluding the current record. Response: `[{ id, jobTitle, hiringCompany, pipelineStage, createdAt, compositeScore }]`. Pattern already proven by `checkReturningCandidate` in `score-candidate.ts:145-169`.
- **Frontend**: in TP context of `CandidatePanel`, `useQuery(['candidate-history', id])` on drawer mount. Render each row as a card with role · company · stage · date · score chip.
- **Empty state**: if the candidate has no prior applications, render *"This is their first application."* instead of a blank list.
- **Privacy**: agency-scoped by the query filter; no new PDPL-sensitive data exposed.
- **Effort**: ~50 min.
- **Status**: agreed.

---

## Test 5.6 — Approve-to-L1 confirmation modal exposes API costs (QA rating: Pass)

Saad's note: *"But we don't want to show the API cost to customer. We can have warning but don't mention the cost for API calls"*

The modal I shipped included "~$0.06 in API costs" in the body and "Each screening uses paid Claude API calls" in the amber warning. Customer-facing text shouldn't leak infrastructure billing language ("API", "Claude", per-call pricing). The right framing is user-impact — screening sends a real WhatsApp to a real person and can't be undone — not infrastructure cost.

### 5.6.a — Rewrite modal text to drop cost/API language
- **Fix**: In `frontend/src/components/candidates/CandidatePanel.tsx` Approve-to-L1 modal block (~line 484), update body + amber copy:
  - Body: *"Approve [Name] to Level 1? This starts WhatsApp screening — 5 personalised questions will be sent and evaluated by AI."*
  - Amber: *"⚠️ Once started, screening is irreversible — the candidate receives the 5 questions immediately."*
- **Keep** title and buttons as-is.
- **Applies to both** CV Inbox context and Pipeline-Applied context (same modal component, single edit).
- **Effort**: 5 min.
- **Status**: agreed.

---

## Test 5.3 — TP Job History section renders (QA rating: Fail → verified PASS)

Saad asked me to verify 5.3 as he couldn't confirm it himself.

**Verdict: PASS.** The test's Expected column reads *"Section renders"* (strict readout). Code inspection (`CandidatePanel.tsx:413-434`) confirms the section is wired unconditionally within the `context === 'talent_pool'` block. Live data fetch against a real candidate (Zainab Khan, id `493f520e...`) confirmed all fields the section reads are populated or fall through to safe fallbacks — section will render one card showing role · score chip · stage · date.

Saad's earlier observation (*"only shows Applied Jobs with no history"*) is a **content** issue, not a render issue. That's captured by Test 4.8 (Fail, agreed fix 4.8.b in this doc). Once 4.8.b ships, 4.8 also flips to Pass. No separate fix needed for 5.3.

---

## Tests 7.2 + 7.3 — "🔄 Screening" badge missing after Approve-to-L1 (QA ratings: Fail, Fail)

Saad's 7.2 note: *"L1 shows 'Pending Interview Invite' Also there is no option to download CV"*
Saad's 7.3 note: empty (expected visible loading state).

Live verification: both are symptoms of the **same race condition**.

**Timing observed on localhost test with candidate 78437e34...**:
- t=0.1s  conversationState becomes `screening_q1` (sim started)
- t=5s    conversationState still `screening_q1` (sim running)
- t=10s   conversationState flips to `cv_received` (sim done)
- t=15s   composite score persisted (30)

So the `screening_q*` window is real in the DB, ~5-10s on localhost (longer in production with real WhatsApp latency).

**Race**: core-api PATCH `/status` returns HTTP 200 *before* firing an HTTP call to whatsapp-service's simulate-screening endpoint, which then writes `screening_q1` — all async. If the frontend's post-PATCH refetch completes before the sim's first write lands (<100ms window on localhost), the refetch sees `conversationState='initiated'`. The kanban card falls through to the AiRecommendationBadge which, with stage=shortlisted + null recommendation, renders *"Pending interview invite"* (the 7.2 symptom).

Worse: the pipeline page's refetchInterval detector only drops to 3s polls *if* it sees any candidate in `screening_q*`. Because the first refetch missed the window, no candidate is in-flight from the detector's perspective → next refetch is 30s later, by which time the sim has completed and conversationState is `cv_received`. The "🔄 Screening" badge never renders (the 7.3 symptom).

### 7.2.a / 7.3.a — Eliminate the race (single fix resolves both)
- **Fix**: In `backend/src/core-api/routes/candidates.ts` PATCH `/:id/status` handler, when `enteringL1` is true and *before* firing the HTTP call to whatsapp-service's simulate-screening, synchronously update the candidate with `conversationState: 'screening_q1'`. Keep the downstream sim endpoint's identical write as a defensive idempotent no-op.
- **Expected outcome**: Any refetch after the PATCH sees `screening_q1`. Polling detector finds an in-flight candidate → drops to 3s interval → card renders "🔄 Screening" for the full sim duration → flips to composite score when sim completes.
- **Also addresses** the Download CV part of Saad's 7.2 note — already covered by 3.10.a (always show button + fix click handler).
- **Effort**: 15 min.
- **Status**: agreed.

---

## Test 7.6 — Score model proposal: 4-dimension weighted, recruiter-editable (QA rating: Partial)

Saad's note (full): *"At Level-1 (after AI CV screening): We should have CV Match score. At Level-2 (after WhatsApp): We should have Commitment + Salary fit. At Level-3 (After Interview): Domain Knowledge Score. Overall score is based on the weightage results of CV match, Commitment, Salary and Domain knowledge… recruiter can edit the weightage as it depends on type of job role. Also in current someone's score shown and someone not shown. Clean the duplication as well. Need to keep short for demo."*

This is a **significant score-model refactor**, not a bug fix. My earlier first-review stance (against Ali's initial raising of the same idea) was to **defer to Phase 7**. Saad is now explicitly asking for it at 7.6. Treating this as a live product decision.

### What Saad is proposing

Per-stage score collection:
| Stage | Scores populated |
|---|---|
| Applied (CV only) | `cvMatchScore` |
| L1 (post-WhatsApp) | `commitmentScore` + `salaryFitScore` |
| L2 (post-Interview) | `interviewTechnicalScore` (new: "Domain Knowledge") |
| L3+ | rolled-up `overallScore` using recruiter-editable weights |

Default weights (proposed, needs confirmation): e.g. `CV 25% + Commitment 25% + Salary 15% + Domain 35%`. Recruiter can adjust per-job.

### What exists today (v1.10.0)

- Applied stage already shows `cvMatchScore` only (post Phase 6k) ✓
- L1 stage computes full composite `= 0.4*CV + 0.4*Commitment + 0.2*Salary` (no Domain Knowledge)
- L2+ schema has `interviewTechnicalScore` + `interviewCultureScore` fields (from v1.8.0) but no UI collects them
- No recruiter-editable weights (they're hardcoded in `shared/recommendations.ts` and `score-candidate.ts`)

### Gap between today and proposal

1. **Domain Knowledge as a distinct L2→L3 dimension** — schema field `interviewTechnicalScore` exists. Need UI to capture it (recruiter enters post-interview) + backend to include it in overall calc.
2. **Overall formula widened to include Domain Knowledge** — today's composite stops at Commitment + Salary Fit. Need to extend.
3. **Per-job recruiter-editable weights** — net-new feature. Needs UI (probably in the job wizard Step 3 or a job-settings page), schema column (`scoreWeights` Json on Job), and backend logic to read weights from job on each rescore.
4. **"Someone's score shown and someone not shown" / clean duplication** — this is a **specific defect** in the current drawer. Saad is noting that the score display is inconsistent across candidates and has duplicate elements. Need to reproduce to fix.

### Recommendation — split into three scoped fixes

**7.6.a — Clean up score display duplication (bug fix, ship soon)**
- Saad's note: *"in current someone's score shown and someone not shown. Clean the duplication as well."*
- Need a browser session with Saad to reproduce which candidates show duplicate vs. missing scores. Likely stems from the L1-vs-L1+ conditional rendering in `CandidatePanel.tsx` being too strict or too loose in certain edge cases.
- **Effort**: 30 min to reproduce + fix.
- **Status**: agreed, pending repro.

**7.6.b — Introduce Domain Knowledge Score in overall formula (scoped feature)**
- Extend `recommendForL3` in `shared/recommendations.ts` to include `interviewTechnicalScore` as a dimension.
- Update drawer to show Domain Knowledge score when `pipelineStage >= 'interviewing'` and the field is populated.
- **Does NOT** include the L2 interview-score capture UI (recruiter-entered form). That's still Phase 7 because no "Interview Feedback" form exists yet.
- For now: either leave the interview score blank (empty field in drawer) or provide an admin-only input field to populate it manually for demo purposes.
- **Effort**: 1-2h (formula change + drawer rendering; UI capture form deferred).
- **Status**: agreed, scoped.

**7.6.c — Recruiter-editable score weights per job (deferred to Phase 7)**
- Net-new feature. Requires: `scoreWeights` column on Job, wizard UI in Step 3, backend to read weights dynamically in `recommendForL2` / `recommendForL3`, default fallback when no weights set, analytics consideration (do historical candidates get re-scored if weights change? no — leave as-scored).
- **Effort**: 4-6h.
- **Status**: deferred to Phase 7. Saad's note says *"Need to keep short for demo"* — this is the part that gets punted.

### Demo-ready position

For upcoming demos: **ship 7.6.a (cleanup) + 7.6.b (Domain Knowledge in formula)**. Skip 7.6.c (recruiter-editable weights) — use hardcoded weights for now, tell prospects *"Per-job score weighting is coming in our next release."*

### 7.6.a breakdown (from live repro with Saad)

Saad shared a screenshot of Khalid Al-Otaibi's drawer — candidate at `shortlisted` (L1) with all four score circles showing dashes. Investigation found:

| Record | Stage | Created | Job | Scores |
|---|---|---|---|---|
| `ff5b9525...` | shortlisted | 2026-04-10 (pre-Phase-6k) | Cloud Architect | all null |
| `ae10d703...` | applied | 2026-04-20 (post-Phase-6k) | Enterprise Architect | cvMatch=92 |

Record 1 is a legacy seed from before Phase 6k scoring landed — it was placed at `shortlisted` without ever going through CV-only scoring or WhatsApp sim. Record 2 is a fresh pool-invite with proper scores. Khalid therefore also appears twice in the Talent Pool list — the "duplication" Saad flagged.

#### 7.6.a.i — Drawer empty state when L1+ has null scores (agreed, ship now)
- **Issue**: Drawer's 4-circle layout assumes post-screening candidates have scores. Legacy shortlisted rows show four dashes — looks broken.
- **Fix**: In `frontend/src/components/candidates/CandidatePanel.tsx` L1+ score section, detect the all-null case and replace the 4-circle row with a neutral card: *"Scores not captured. This candidate was promoted before automated scoring was available."*
- **Effort**: 15 min.
- **Status**: agreed.

#### 7.6.a.ii — Backfill CV Match for stale L1+ rows (deferred to next phase)
- **Idea**: One-shot migration: `SELECT id FROM candidates WHERE pipeline_stage IN ('shortlisted','interviewing','offered','hired') AND cv_match_score IS NULL`. Call `POST /api/v1/ai/score-cv` for each. Populates `cvMatchScore` without changing stage.
- **Why deferred**: Cosmetic backfill on stale data. Empty-state from 7.6.a.i already handles the bad look honestly. Claude cost for candidates unlikely to become real hires isn't justified.
- **Status**: deferred to next phase.

#### 7.6.a.iii — Talent Pool dedupe by identity (agreed, ship now)
- **Issue**: Pool-invite flow creates a new candidate row per job application (by design). Talent Pool list shows all rows, so a person with multiple applications appears multiple times. Saad flagged this as "duplication" in his 7.6 note.
- **Fix**: In the Talent Pool search query (`bulk-upload.ts` / wherever `/talent-pool/search` lives), collapse rows by `email OR waNumberHash`. Show one row per unique identity, aggregate view: latest stage, best composite, application count.
- **Effort**: 1h.
- **Status**: agreed.

---

## Test 7.7 — Rejection message same across all levels (QA rating: Pass, FR noted)

Saad's note: *"When rejected it generates message to candidate and it applies to all levels"*

Today's rejection behaviour:
1. Recruiter rejects → `pipelineStage='rejected'`. **No proactive message** is sent to the candidate.
2. If the candidate sends `status` / `حالة` via WhatsApp, `conversation.ts:45,57` replies with a fixed rejection string — same regardless of stage.

### 7.7.a — Store `rejectedFromStage` (foundation)
- **Schema**: add `rejectedFromStage` VarChar column on Candidate.
- **Backend**: in `routes/candidates.ts` PATCH handler, when new stage is `'rejected'`, capture the previous stage into `rejectedFromStage` before the update.
- **Effort**: 15 min.
- **Status**: agreed.

### 7.7.b — Two-tier rejection message on status query
- **Fix**: Replace the fixed `MSG.statusEn.rejected` / `MSG.statusAr.rejected` with a function that returns one of two messages based on `rejectedFromStage`:
  - Pre-screening (`applied` / `evaluated` / `shortlisted`): *"Thank you for applying. After reviewing your profile, we've decided to proceed with other candidates whose background is closer to this specific role. We'll keep your details for future opportunities."*
  - Post-screening (`interviewing` / `offered`): *"Thank you for taking the time to engage in our screening process. We've decided to proceed with another candidate for this role but were impressed with your effort, and we'll keep your profile on file."*
- Plus Arabic equivalents.
- **Effort**: 15 min.
- **Status**: agreed.

### 7.7.c — Proactive rejection WhatsApp on recruiter action (deferred to Phase 7)
- **Idea**: When recruiter clicks Reject, push the rejection message to WhatsApp immediately — don't wait for the candidate to check status.
- **Why deferred**: PDPL / cultural sensitivity (some agencies prefer silence for no-hires; needs a per-agency toggle); should ship with 360dialog production integration, not against the mock; candidate-rejection flow warrants polish time.
- **Effort**: 2-3h.
- **Status**: deferred to Phase 7.

---

## Test 8.2 — AI Recommendation reason truncated (QA rating: Partial)

Saad's note: *"Text is hidden. It should be clickable showing all details"*

The `truncate` class on the reason line caps it at one ellipsised line, but backend stores up to 500 chars. Recruiter sees partial sentences with no way to see the rest.

### 8.2.a — Click-to-expand AI Recommendation block
- **Fix**: In `frontend/src/components/candidates/CandidatePanel.tsx` AI Recommendation block: wrap in a clickable `<button>` with `useState` toggle. Collapsed view keeps `truncate` single line. Expanded view shows full reason text (wraps naturally) plus a stage-transition label (*"For: Applied → L1"*) and a chevron ▸/▾ affordance. Keyboard accessible.
- **Effort**: 30 min.
- **Status**: agreed.

---

## Test 8.3 — Approve flow surfaces API message (QA rating: Partial)

Saad's note: *"We should not show the message of API. Its irrelevant for customer"*

Same code path as 5.6. The only user-visible "API"/"Claude" strings in the frontend are the Approve-to-L1 confirmation modal (body line 605, amber line 608). The modal is triggered from both the CV Inbox drawer (5.6) and the Pipeline Applied drawer (8.3) — one component, two entry points, one fix.

### 8.3.a — Covered by 5.6.a
- **Status**: no separate fix. Both 5.6 and 8.3 flip Partial → Pass after 5.6.a ships.

---

## Test 8.5 — Drag to different levels doesn't work (QA rating: Fail)

Saad's observation: *"while i try drag to different levels it wont work"* (expanded from the original "Fit into Applied" note).

Live verification: backend works (PATCH returns 200 in ~6ms, stage changes correctly, history appends, backward warns fire). The failure is in the frontend drag detection.

**Root cause**: `KanbanBoard.tsx:44-62` uses `collisionDetection={closestCorners}` with dnd-kit. When a column already has candidate cards in it, the closest drop target by corner proximity is almost always one of those existing cards — not the empty column background. The handler then reads `over.id` as the card's UUID, the `isColumn` check fails, and it silently returns with no mutation, no toast, no visual cue. Drag to an empty column works; drag to a populated column silently fails.

Also surfaced a related bug: backward drag from L2+ to L1 re-fires WhatsApp screening (see 8.5.b).

### 8.5.a — Handle drag onto cards inside columns
- **Fix**: In `handleDragEnd`, if `over.id` matches a candidate id (not a column key), look up that card's `pipelineStage` and map it to the column it belongs to. Use the column key as the target stage. Something like:
  ```tsx
  const overCard = candidates.find(c => c.id === over.id)
  let targetStage = overCard
    ? stages.find(s => s.key === overCard.pipelineStage || (s as any).stages?.includes(overCard.pipelineStage))?.key
    : over.id as PipelineStage
  if (!targetStage || !stages.some(s => s.key === targetStage)) return
  if (candidate.pipelineStage === targetStage) return
  onStageChange(candidateId, targetStage)
  ```
- **Effort**: 20 min.
- **Status**: agreed.

### 8.5.b — Guard against re-firing WhatsApp sim on backward drag to L1
- **Fix**: In `backend/src/core-api/routes/candidates.ts` PATCH handler, tighten the `enteringL1` check so it only fires when coming from a pre-screening stage (applied / evaluated / screening / null). Don't re-fire when coming back from interviewing / offered / hired — those candidates already have screening results and re-running wastes a Claude call + confuses the audit trail.
  ```tsx
  const enteringL1 = pipelineStage === 'shortlisted'
    && ['applied','evaluated','screening'].includes(prevStage || '')
  ```
- **Effort**: 5 min.
- **Status**: agreed.

---

## Test 8.6 — Stage history JSON (QA rating: Fail → verified PASS)

Live DB query against the highest-transitions candidate (Raj Cloud Krishnamurthy, 5 transitions) returned a fully-populated `pipelineStageHistory` JSON:

```json
[
  { "from": "evaluated",    "to": "shortlisted",   "userId": "...", "timestamp": "2026-04-19T13:22:40Z" },
  { "from": "shortlisted",  "to": "interviewing",  "userId": "...", "timestamp": "2026-04-23T11:16:48Z" },
  { "from": "interviewing", "to": "offered",       "userId": "...", "timestamp": "2026-04-23T11:20:10Z" },
  { "from": "offered",      "to": "interviewing",  "userId": "...", "timestamp": "2026-04-23T11:20:38Z" },
  { "from": "interviewing", "to": "offered",       "userId": "...", "timestamp": "2026-04-23T11:20:47Z" }
]
```

Forward moves + backward moves both captured with full metadata. Test's Expected (*"JSON contains both transitions"*) is satisfied.

**Verdict: PASS.** Flip in the QA plan. Likely Fail-rating was because the history isn't UI-visible (lives on the candidate row, never surfaced to recruiters). If Saad wants a UI audit-trail view, that's a new feature request — not this test's scope.

---

## Test 8.7 — Hold recommendation reason (QA rating: Pass — verified ✓)

Live query found 3 candidates with `aiRecommendation='hold'`, all with "Borderline"-family reasoning as expected:
- Nadia Hussain: *"Borderline composite (62.6) — review carefully before interview"*
- Nadia Hussain: *"Borderline match (composite 66.6) — review carefully"*
- Omar Al-Mansoori: *"High CV match (83.8) but vague screening answers (commitment 62) — worth a call"*

**Verdict: PASS confirmed.** No action.

---

## Test 8.8 — Reject recommendation reason (QA rating: Pass — verified ✓)

Live query found 5 candidates with `aiRecommendation='reject'`, all with "Missing must-have:"-family reasoning as expected:
- Layla Hassan: *"Missing must-have: 3+ years of experience in cloud architecture..."*
- Zainab Khan: *"Missing must-have: Candidate is significantly overqualified..."* (unusually long — Claude gave a multi-factor narrative)
- Omar Al-Mansoori: *"Missing must-have: Deep expertise in AWS..."*
- بلال طارق: *"Missing must-have: Minimum 6 years of proven work experience..."*
- Zainab Khan: *"Missing must-have: 3+ years of experience in cloud architecture..."*

**Verdict: PASS confirmed.** One incidental finding — Zainab's multi-factor reason is >400 chars and reinforces why 8.2.a (click-to-expand) matters for the drawer display.

---

# Summary — QA Review Complete

**Total tests**: 85 (80% Pass · 12% Partial · 8% Fail as rated by Saad)

**After verification** (three rating flips):
- 5.3 TP Job History: Fail → **Pass** (section renders; content gap covered by 4.8)
- 8.6 Stage history JSON: Fail → **Pass** (backend correctly populates the audit)
- Net: 3 fewer Fails.

### Agreed fixes (to ship) — 27 items (Ali approved 2026-04-24, promoted 4.3.c from Phase 7)

Copy/UI (Sprint 1): 1.1.b · 2.3.a · 2.4.a · 2.4.b · 2.5.a · 2.6.b · 4.3.b · 5.6.a (covers 8.3) · 7.6.a.i
Drawer (Sprint 2): 3.9.a · 3.10.a · 4.8.a · 8.2.a
Backend bug fixes (Sprint 3): 2.6.a · **2.6.c** (moved from Sprint 1 per Ali — ship with 2.6.a) · 7.2.a / 7.3.a · 7.7.a · 7.7.b · 8.5.a · 8.5.b
Features (Sprint 4): 4.4.a (with Phase 8 TODO comment per Ali) · 4.8.b · 7.6.b
Data cleanup (Sprint 5): 4.3.a · **4.3.c** (promoted from Phase 7 per Ali) · 7.6.a.iii · end-state: exactly 4 active demo jobs
Awaiting logo from Saad: 1.1.a

### Deferred to Phase 7 — 5 items (was 6, 4.3.c promoted out)

3.10.b (persist original PDF) · 4.4.c (Claude re-score) · 7.6.a.ii (CV Match backfill for stale L1+) · 7.6.c (recruiter-editable weights) · 7.7.c (proactive rejection WhatsApp)

### Verified Pass, no action — 3 items

5.3 TP Job History renders · 8.6 stage history JSON · 8.7 hold reason · 8.8 reject reason

---

# Post-v1.11.0 — Module 7 E2E walkthrough findings (2026-04-26)

After v1.11.0 shipped, Saad walked Module 7 end-to-end. Two issues surfaced
in flow-context that didn't appear as discrete test rows.

## v1.11.1 — `5566c9f` — Duplicate Add-to-Pipeline rows

**Finding**: Cloud Architect — DigyCorp pipeline showed 18× Zainab Khan, 8×
Fatima Al-Zaabi, 5× Nadia Hussain, 2× James Thornton (43 rows for 14 distinct
people).

**Root cause**: Sprint 5 (7.6.a.iii) deduped the Talent Pool *list* but the
*insert path* `/jobs/:jobId/invite-from-pool` at `bulk-upload.ts:259` mutated
`wa_number_hash` with a timestamp suffix, sidestepping any uniqueness, with no
app-level identity check. Every recruiter click during QA created a new row.

**Fix**:
- Backend identity guard: query for any row in target jobId where
  `email = c.email` OR `waNumberHash` startsWith `baseHash` (handles legacy
  suffixed rows). If found, skip insert and push to `skipped[]` array.
- Drop the timestamp-suffix mutation. Use source `waNumberHash` as-is.
- Response shape additive: `{ invited, skipped: [{candidateId, existingId,
  fullName}], jobTitle }`.
- Frontend toast variants: "Added N", "Added N · M already in pipeline",
  "X is already in this job's pipeline".
- One-shot SQL cleanup for Cloud Architect: 43 → 14 rows. Per identity, kept
  highest pipeline_stage row (priority hired > offered > … > rejected),
  tiebreaker compositeScore desc, tiebreaker created_at desc.

**Verification**: Re-add same candidate twice → first call returns
`{invited:1, skipped:[]}`, second returns `{invited:0, skipped:[…]}`. DB count
unchanged after second click.

## v1.11.2 — `4cd20af` — TP-direct → L1 + history detail + analytics KPI

**Finding (UX)**: After v1.11.1, walking the flow surfaced two more gaps:

1. Top score block on TP drawer was anchorless when no "Match for" job was
   selected. Showed a candidate's stored composite (her last application's
   score) without telling the user "from which job."
2. Application History rows were display-only. Saad expected to click and see
   per-job score breakdown + AI rec + rejection reason.

**Finding (workflow)**: TP → Applied → L1 requires two clicks + two screen
contexts. When the recruiter has already vetted the candidate against the
selected job in TP, the Applied review step is ceremony. Ali approved
collapsing this to one click while preserving the cautious 2-step path as a
secondary option.

**Fix (product change)**:
- TP drawer (with job selected): primary `✅ Approve to L1` button (paid-Claude
  modal preserved) + secondary `📥 Add to Pipeline (review first)`. Approve to
  L1 → `POST /jobs/:jobId/invite-from-pool` with `approveToL1:true` → row
  created at `shortlisted` directly with `conversationState=screening_q1`
  synchronous, then WhatsApp sim fires async.
- TP drawer (no job selected): score block now captioned "From last
  application: <Job> · <stage> · <date>".
- ApplicationHistoryBlock: clickable rows expanding to show
  cvMatch/commitment/salary/composite scores, AI rec + reason, and rejection
  details.
- Backend `/candidates/:id/history` extended with 7 fields.
- Backend `/candidates/:id` includes `job: { title, hiringCompany }`.
- New endpoint `POST /jobs/:jobId/preview-score` (proxies ai-engine
  `/preview-score-cv`) for dry-run CV-against-job scoring without DB write —
  supports future TP "show match before commit" UX.

**Fix (analytics, per Ali)**:
- `pipelineStageHistory[0]` carries `entryPath` tag: `'tp_direct'` (TP →
  applied or TP → shortlisted) or `'cv_inbox'` (bulk upload accept). Schema
  unchanged — JSON field absorbs the extra key.
- `/analytics` adds `kpis.tpDirectL1{Count, Percent, Total}`. Counts L1+
  candidates whose first stage-history entry is `to=shortlisted` with
  `entryPath='tp_direct'`.
- Analytics Pipeline Funnel card displays "TP → L1 direct: X / Y L1 entries
  (Z% skipped Applied review)".

**Verification**: Aisha Qasim approved-to-L1 from TP. DB row landed at
`shortlisted` with `conversationState=screening_q1` and
`pipelineStageHistory[0].entryPath='tp_direct'`. Analytics returned
`tpDirectL1Count: 1, Total: 14, Percent: 7%`. All 5 dashboard pages 200.

## v1.11.3 — `c51d6da` — Live CV re-score in TP drawer + flow simplification

**Finding (UX)**: Saad's screenshot of Nadia Hussain's drawer (TP, "Match for"
= active Cloud Architect — DigyCorp) surfaced three issues:

1. **Stale top score**. Drawer showed 83 (her composite). But she has TWO
   Cloud Architect — DigyCorp rows in DB:
   - `2723ad53` (CLOSED job): shortlisted, composite=83, 2026-04-19
   - `b5bde6ce` (ACTIVE job — the selected Match for): shortlisted, composite=66, 2026-04-17

   The TP dedupe picks the most-recent row as canonical → drawer rendered
   the 83 row. The 66 (her actual stored score for THIS active job) appeared
   only in Application History below. Saad couldn't reconcile and read
   "previous score was 66, why does it say 83?"

2. **CV parsing for the new job not shown**. v1.11.2 shipped `/preview-score`
   backend-only; never wired to the drawer. Saad's explicit override of the
   prior cost concern: "Please ship CV parsing in this phase".

3. **"Add to Pipeline (review first)" muddied the single-action flow**.
   He had earlier approved keeping it as a Hold-for-review path; on seeing
   the live UI he decided the secondary button was clutter.

**Fix**:

Frontend (`CandidatePanel.tsx`)
- New `useQuery` for preview-score, keyed by `[candidateId, jobId]` with
  `staleTime: Infinity` and `refetchOnWindowFocus: false`. Session-cache
  prevents re-billing Claude on drawer re-opens.
- New top branch in score block: when `context==='talent_pool' && jobId`,
  render a gold "Match for: <Job>" card driven by LIVE preview-score data
  (cvMatchScore, mustHaveSkills evidence chips, hardFilterPass +
  hardFilterFailReason, AI recommendation + reason). Loading spinner
  while Claude runs (~10s). Error fallback renders stored score with a
  "live re-score failed" caption.
- Removed secondary "Add to Pipeline (review first)" button. Single
  CTA: `Approve to L1`.

Backend (`candidates.ts`)
- `/candidates/:id/history`: dropped `id: { not: target.id }` exclusion.
  Canonical row now appears in history alongside other past applications.
  Reason: top of drawer now shows a LIVE preview-score (different from the
  canonical's stored fields), so the canonical's stored scores belong in
  the history list.

**Verification**:
- `/preview-score` for Nadia vs ACTIVE Cloud Architect: cvMatch=42 (vs.
  her stale stored 83), hardFilterPass=true, aiRec='reject — CV match weak
  (42)'. 8 must-have skills with ✓/✗ evidence.
- `/history` returns 3 rows for Nadia (was 2 — canonical 83 row included).
- All 5 dashboard pages 200.

**Open / Phase 7 carryover**:
- Manual "Re-score" refresh button — deferred. Session cache is the cost
  control; if recruiter wants forced refresh, close + reopen the drawer.
- The active Cloud Architect job's must-have list is bloated (8 entries
  per CLAUDE.md "JD must-haves generator is too aggressive" Known Issue).
  Phase 8 adaptive threshold or process-jd.ts prompt tuning will fix.
