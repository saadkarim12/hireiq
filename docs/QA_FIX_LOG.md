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
