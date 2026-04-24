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

### 4.3.c — DB uniqueness guard + duplicate warning in wizard (deferred to Phase 7)
- **Idea**: Add a constraint or soft-warning when recruiter tries to create a second active job with the same (title, hiringCompany). Prevents future pollution at the point of creation.
- **Effort**: 1h.
- **Status**: deferred (Phase 7 hardening pass).

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
