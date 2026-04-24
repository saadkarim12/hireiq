# Sprint Plan — QA v1.2 → v1.11.0

Implementation order for the 27 agreed fixes (26 original + 4.3.c promoted from Phase 7 per Ali's approval 2026-04-24). Grouped by risk and dependency so low-risk wins ship first, each sprint is commitable + QA-retestable in isolation.

Target release: **v1.11.0** after all five sprints ship and full 85-test retest passes.

Total estimated engineering: **~10-12h** across five sprints.

**Approved by Ali 2026-04-24** with 8 additions (baked into the sprints below).

---

## Pre-flight — QA v1.3 tracking document

**Before Sprint 1 coding begins**: create `docs/HireIQ_QA_Test_Plan_v1.3.docx` as a copy of v1.2 with two new columns added to every test module table:
- **Retest Result** (Pass / Fail / blank)
- **Commit Hash**

Preserve all of Saad's original v1.2 notes.

**Commit this as the first commit in the v1.11.0 series** so the starting state is in git before any fix lands.

**During Sprints 1-5**: after each sprint's retest, update v1.3 with retest outcomes + commit hashes. Commit message: `docs: QA v1.3 update — Sprint N retest results`.

**Before v1.11.0 tag**: every one of the 85 rows must have a Retest Result + Commit Hash filled in. Any row still Fail = blocker.

---

## Retest gate (Mansur runs, not Saad)

After each sprint, Mansur is responsible for:

1. **Execute all fixed tests for that sprint end-to-end in the browser** (not just code inspection — actual click-through).
2. **Execute 5 random adjacent-module tests as regression spot-check**.
3. **Update `HireIQ_QA_Test_Plan_v1.3.docx`** with Pass/Fail + commit hash for each test retested this sprint.
4. **If anything fails retest**: hotfix commit in the same sprint before moving on. Don't paper over with a defer.
5. **Post summary here** showing: tests passed, tests failed (if any), commit hashes shipped.

Saad validates after v1.11.0 ships (not per-sprint). Saad is product owner; Mansur is engineering QA. Don't route every sprint gate through Saad.

---

## Sprint 1 — Copy + cosmetic polish (~2h)

Zero backend risk. All user-visible string / layout changes. Single commit.

**Note**: 2.6.c helper text **moved to Sprint 3** per Ali — ship with 2.6.a (Add Custom Question button). Don't ship helper copy pointing at a button that doesn't exist yet.

| # | File(s) | Change |
|---|---|---|
| 1.1.b | `components/layout/Sidebar.tsx:38-50` | Drop the `session?.user?.agencyId` conditional; always show "Agency Platform" |
| 2.3.a | `app/(dashboard)/jobs/new/page.tsx:69-76` | Remove `GB` + `US` entries from `COUNTRIES` |
| 2.4.a | `app/(dashboard)/jobs/new/page.tsx:159,487-496` | Flip default `jdMode: 'builder'` → `'paste'`; swap tab order |
| 2.4.b | `app/(dashboard)/jobs/new/page.tsx` (paste textarea footer) | Add helper link: *"Don't have a JD yet? Use AI Builder →"* |
| 2.5.a | `app/(dashboard)/jobs/new/page.tsx:41-42,228,660-695` | Delete 3-box threshold UI + summary paragraph; replace with read-only AI Recommendation Bands legend. Drop `autoApproveThreshold` + `autoRejectThreshold` from schema and payload. **Legend must include (Ali's addition)**: *"These bands are system-wide. AI recommendations are advisory — recruiters make all advancement decisions."* |
| 2.6.b | `app/(dashboard)/jobs/new/page.tsx:728-730` | Subtitle: *"Edit or add your own."* (drop "reorder") |
| 4.3.b | `app/(dashboard)/talent-pool/page.tsx:206` + any other job-dropdown render sites | Label: `{title} — {company} · {dd MMM}` |
| 5.6.a | `components/candidates/CandidatePanel.tsx:605,608` | Rewrite modal body + amber to drop "Claude" / "API" / "$0.06" language. **Covers 8.3** |
| 7.6.a.i | `components/candidates/CandidatePanel.tsx` L1+ score section | When stage is L1+ and all four scores are null, render neutral card instead of 4 dashes |

**Sprint 1 retest**: 1.1 · 2.3 · 2.4 · 2.5 · 2.6.b alone (2.6.a retest delayed to Sprint 3) · 4.3 (dropdown label) · 5.6 · 8.3 · 7.6.a.i (empty-state visual). Plus 5 regression spot-checks from adjacent modules.

---

## Sprint 2 — Drawer improvements (~2h)

All touch `CandidatePanel.tsx`. Bundle as one commit.

| # | File(s) | Change |
|---|---|---|
| 3.9.a | `components/candidates/CandidatePanel.tsx` Key Details grid | Add WhatsApp row. `atob(candidate.waNumberEncrypted)` for display. Placeholder `—` when empty. Applies to all three contexts (TP/CV-Inbox/Pipeline) |
| 3.10.a | `components/candidates/CandidatePanel.tsx` action bar + `handleDownloadCV` | Always show Download CV button. Rewrite handler to use `responseType: 'blob'`, create object URL, trigger native browser download |
| 4.8.a | `components/candidates/CandidatePanel.tsx:415` | Rename heading "Applied Jobs" → "Application History" |
| 8.2.a | `components/candidates/CandidatePanel.tsx` AI Recommendation block | Wrap in clickable `<button>` with `useState` toggle. Expanded view shows full reason (no truncate) + stage label ("For: Applied → L1") + chevron |

**Sprint 2 retest**: 3.9 · 3.10 · 4.8 (section renders + rename only — 4.8.b content comes in Sprint 4) · 5.1-5.9 (drawer contexts) · 8.2. Plus 5 regression spot-checks.

---

## Sprint 3 — Backend bug fixes (~2h)

Mix of backend logic, schema, and frontend drag. Each item has its own test path. Now includes 2.6.a + 2.6.c per Ali's reordering.

| # | File(s) | Change |
|---|---|---|
| 7.2.a / 7.3.a | `backend/src/core-api/routes/candidates.ts` PATCH handler | When `enteringL1`, synchronously write `conversationState: 'screening_q1'` BEFORE firing the fire-and-forget sim HTTP call. Eliminates the race |
| 8.5.b | same PATCH handler | Tighten `enteringL1` to also require `prevStage ∈ {applied, evaluated, screening, null}`. Prevents re-firing sim on backward drag from L2+ |
| 8.5.a | `frontend/src/components/pipeline/KanbanBoard.tsx:44-62` | When `over.id` is a candidate UUID (dropped on a card), map to that card's column key via `stages.find`. Fall through to normal column-drop handling |
| 7.7.a | `backend/prisma/schema.prisma` Candidate model + `routes/candidates.ts` PATCH | Add `rejectedFromStage` VarChar column. On PATCH → rejected, capture previous stage. Run `prisma db push` + `prisma generate` |
| 7.7.b | `backend/src/whatsapp-service/handlers/conversation.ts:45,57` | Replace fixed `rejected` string with a function taking `rejectedFromStage`. Two tiers (pre-screening vs post-screening). Arabic + English |
| 2.6.a | `frontend/src/app/(dashboard)/jobs/new/page.tsx` Step 4 | Add "+ Add Custom Question" button below question list. On click: append blank question with type dropdown (default `skill_probe`), auto-focused English textarea |
| 2.6.c | same file — helper below the "+ Add Question" button | **Ali's strengthened copy**: *"Custom questions are English-only in this release. Candidates on Arabic will receive the English version. Arabic auto-translation coming in Phase 7."* |

**Sprint 3 retest**: 2.6 full (now including 2.6.a+2.6.c) · 7.2 · 7.3 · 7.7 · 8.5. Plus 5 regression spot-checks.

---

## Sprint 4 — Features (~3-5h)

Bigger scope. Ali OK'd stretching to 4-5h; **don't cut corners to hit 3h**.

### 4.4.a — Rewrite talent-matches algorithm
File: `backend/src/core-api/routes/bulk-upload.ts:122-198`.
- Split `requiredSkills` from `preferredSkills` explicitly.
- Hard gate: drop candidate if `requiredMatchPct < 0.5`.
- Scoring: `skillScore = requiredMatchPct × 70 + preferredMatchPct × 30`. **Drop** `storedScore × 0.4` cross-job carryover.
- String match: only against `cvSkills[]`, not raw `cvStructured` JSON body.

**Required — Ali's addition** — explicit TODO at the constant:
```ts
// TODO: Phase 8 — adaptive threshold based on must-have count
//   1-3 must-haves → 100% match required (small deliberate list)
//   4-6 must-haves → 66% match required (typical list)
//   7+ must-haves → 50% match required (likely bloated list)
const HARD_GATE_THRESHOLD = 0.5
```

### 4.8.b — Application history endpoint + UI
- **Backend**: new `GET /api/v1/candidates/:id/history`. Returns all candidates sharing `waNumberHash` OR `email` within the same agency, excluding the current record. Pattern mirrors `checkReturningCandidate` at `score-candidate.ts:145-169`.
- **Frontend**: in TP context of `CandidatePanel`, `useQuery(['candidate-history', id])` on drawer mount. Render as card list. Empty state: *"This is their first application."*

### 7.6.b — Domain Knowledge in overall formula
- Extend `shared/recommendations.ts` `recommendForL3` to include `interviewTechnicalScore` as a 4th dimension.
- Drawer: show Domain Knowledge score when `pipelineStage ∈ {interviewing, offered, hired}` and the field is populated.
- Does NOT build interview-score capture form (Phase 7). For demo, populate via API or seed.

**Sprint 4 retest**: 4.4 · 4.8 full · 7.6 full. Plus 5 regression spot-checks.

---

## Sprint 5 — Data cleanup + 4.3.c guard + demo data target (~1.5h)

Now includes the promoted 4.3.c (DB uniqueness guard) per Ali.

### 4.3.a — Soft-close duplicate test jobs
One-shot SQL (or Prisma script): for each `(agencyId, title, hiringCompany)` combo with >1 active row, keep the most recent + any with bound non-rejected candidates, set `status='closed'` on the rest.

### 4.3.c — DB uniqueness guard + wizard warn (NEW — Ali promoted from Phase 7)
- **Backend**: on job create in `routes/jobs.ts`, check for existing active `(agencyId, title, hiringCompany)` combo. If found, return a `409` with message *"A job with this title and company is already active. Duplicate?"* Frontend can still force-create with an explicit `allowDuplicate: true` payload field.
- **Frontend**: in Step 1 of the wizard (where title + company are entered), lightweight async check on blur — if duplicate detected, show amber warning below the title field: *"An active '{title}' at {company} already exists. Make sure this is a distinct role before continuing."*
- Cheap insurance against re-pollution after 4.3.a clean-up.

### 7.6.a.iii — Talent Pool dedupe
File: `backend/src/core-api/routes/bulk-upload.ts` `/talent-pool/search` handler.
- Collapse rows by `email` (primary) or `waNumberHash` (fallback when email is null).
- Show one row per unique identity. Aggregate fields: latest pipelineStage, max compositeScore, count of applications.

### Sprint 5 end state — demo data target (Ali's addition)

Exactly **4 active jobs** remain after 4.3.a cleanup:
- **Cloud Architect — DigyCorp** (direct employer story)
- **Enterprise Architect — DigyCorp** (multi-job re-scoring story)
- **Finance Manager — Salt Recruitment** (non-tech industry, agency story)
- **Senior HR Business Partner — Salt Recruitment** (recruitment-adjacent story)

All other active jobs soft-close to `status='closed'`. Preserve candidate linkage; no hard deletes. If the fourth job (Senior HR BP) doesn't exist in seed data today, create it as part of Sprint 5.

**Sprint 5 retest**: 4.3 · 4.4 (re-verify filter against clean data) · 4.8 (re-verify history with clean data). Plus 5 regression spot-checks. Verify active-job count = 4 exactly.

---

## v1.11.0 release gate (Ali's explicit checklist)

All must be true before tagging:

1. **All 5 sprints shipped** (commit hashes recorded in QA v1.3).
2. **Full 85-test retest passed** — every Pass/Fail column green.
3. **`HireIQ_QA_Test_Plan_v1.3.docx` complete**: all 85 rows have Retest Result + Commit Hash filled. Any Fail = blocker.
4. **`CLAUDE.md` updated** with v1.11.0 shipped history.
5. **BRD v5.5** — my call whether architectural decisions merit a bump. If the score-model dimension change (7.6.b Domain Knowledge) counts, yes. Otherwise v5.4 stays.
6. **Exactly 4 active demo jobs** in the clean state listed above.
7. **Git tag `v1.11.0`** with a comprehensive message listing each sprint's deliverables.
8. **Post final summary** with the v1.11.0 commit hash.

---

## Outside this plan

**Awaiting from Saad**: HireIQ logo (PNG/SVG, ≥ 512×512) for 1.1.a favicon. Drop into `frontend/src/app/favicon.ico` or `icon.png`.

**Phase 7 items** (remaining after 4.3.c was promoted):
3.10.b · 4.4.c · 7.6.a.ii · 7.6.c · 7.7.c
