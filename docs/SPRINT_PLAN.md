# Sprint Plan — QA v1.2 → v1.11.0

Implementation order for the 26 agreed fixes from `QA_FIX_LOG.md`. Grouped by risk and dependency so low-risk wins ship first, confidence builds, each sprint is commitable + QA-retestable in isolation.

Target release: **v1.11.0** after all five sprints ship and QA retest passes.

Total estimated engineering: **~10h** across five sprints.

---

## Sprint 1 — Copy + cosmetic polish (~2h)

Zero backend risk. All user-visible string / layout changes. Single commit, easy to retest.

| # | File(s) | Change |
|---|---|---|
| 1.1.b | `components/layout/Sidebar.tsx:38-50` | Drop the `session?.user?.agencyId` conditional; always show "Agency Platform" |
| 2.3.a | `app/(dashboard)/jobs/new/page.tsx:69-76` | Remove `GB` + `US` entries from `COUNTRIES` |
| 2.4.a | `app/(dashboard)/jobs/new/page.tsx:159,487-496` | Flip default `jdMode: 'builder'` → `'paste'`; swap tab order |
| 2.4.b | `app/(dashboard)/jobs/new/page.tsx` (paste textarea footer) | Add helper link: *"Don't have a JD yet? Use AI Builder →"* |
| 2.5.a | `app/(dashboard)/jobs/new/page.tsx:41-42,228,660-695` | Delete 3-box threshold UI + summary paragraph; replace with read-only AI Recommendation Bands legend. Drop `autoApproveThreshold` + `autoRejectThreshold` from schema and payload |
| 2.6.b | `app/(dashboard)/jobs/new/page.tsx:728-730` | Subtitle: *"Edit or add your own."* (drop "reorder") |
| 2.6.c | `app/(dashboard)/jobs/new/page.tsx` (below Step 4 "+ Add Question" button — depends on Sprint 3's 2.6.a) | Helper: *"Custom questions are English-only — candidates on Arabic get the English version."* **Must ship with 2.6.a, not earlier** |
| 4.3.b | `app/(dashboard)/talent-pool/page.tsx:206` + any other job-dropdown render sites | Label: `{title} — {company} · {dd MMM}` |
| 5.6.a | `components/candidates/CandidatePanel.tsx:605,608` | Rewrite modal body + amber to drop "Claude" / "API" / "$0.06" language. **Covers 8.3.** |
| 7.6.a.i | `components/candidates/CandidatePanel.tsx` L1+ score section | When stage is L1+ and all four scores are null, render neutral card instead of 4 dashes |

**Sprint 1 exception**: 2.6.c depends on 2.6.a (Sprint 3) — drop it here, ship it with 2.6.a.

---

## Sprint 2 — Drawer improvements (~2h)

All touch `CandidatePanel.tsx`. Bundle as one commit to keep the drawer consistent.

| # | File(s) | Change |
|---|---|---|
| 3.9.a | `components/candidates/CandidatePanel.tsx` Key Details grid | Add WhatsApp row. `atob(candidate.waNumberEncrypted)` for display. Placeholder `—` when empty. Applies to all three contexts (TP/CV-Inbox/Pipeline) |
| 3.10.a | `components/candidates/CandidatePanel.tsx` action bar + `handleDownloadCV` | Always show Download CV button. Rewrite handler to use `responseType: 'blob'`, create object URL, trigger native browser download |
| 4.8.a | `components/candidates/CandidatePanel.tsx:415` | Rename heading "Applied Jobs" → "Application History" |
| 8.2.a | `components/candidates/CandidatePanel.tsx` AI Recommendation block | Wrap in clickable `<button>` with `useState` toggle. Expanded view shows full reason (no truncate) + stage label ("For: Applied → L1") + chevron |

---

## Sprint 3 — Backend bug fixes (~2h)

Mix of backend logic, schema, and frontend drag. Each item has its own test path.

| # | File(s) | Change |
|---|---|---|
| 7.2.a / 7.3.a | `backend/src/core-api/routes/candidates.ts` PATCH handler | When `enteringL1`, synchronously write `conversationState: 'screening_q1'` BEFORE firing the fire-and-forget sim HTTP call. Eliminates the race. Single line diff on the Prisma update |
| 8.5.b | same PATCH handler | Tighten `enteringL1` to also require `prevStage ∈ {applied, evaluated, screening}`. Prevents re-firing sim on backward drag from L2+ |
| 8.5.a | `frontend/src/components/pipeline/KanbanBoard.tsx:44-62` | When `over.id` is a candidate UUID (dropped on a card), map to that card's column key via `stages.find`. Fall through to normal column-drop handling. Eliminates silent drag failures |
| 7.7.a | `backend/prisma/schema.prisma` Candidate model + `routes/candidates.ts` PATCH | Add `rejectedFromStage` VarChar column. On PATCH → rejected, capture previous stage. Run `prisma db push` + `prisma generate` |
| 7.7.b | `backend/src/whatsapp-service/handlers/conversation.ts:45,57` | Replace fixed `rejected` string with a function taking `rejectedFromStage`. Two tiers (pre-screening vs post-screening). Arabic + English |
| 2.6.a | `frontend/src/app/(dashboard)/jobs/new/page.tsx` Step 4 | Add "+ Add Custom Question" button below question list. On click: append blank question with type dropdown (default `skill_probe`), auto-focused English textarea. Ship with 2.6.c helper (from Sprint 1). No backend change — screeningQuestions is just a JSON blob on Job |

---

## Sprint 4 — Features (~3h)

Bigger scope, each merits its own commit + retest.

### 4.4.a — Rewrite talent-matches algorithm
File: `backend/src/core-api/routes/bulk-upload.ts:122-198`.
- Split `requiredSkills` from `preferredSkills` explicitly.
- Hard gate: drop candidate if `requiredMatchPct < 0.5`.
- Scoring: `skillScore = requiredMatchPct × 70 + preferredMatchPct × 30`. **Drop** `storedScore × 0.4` cross-job carryover.
- String match: only against `cvSkills[]`, not raw `cvStructured` JSON body.
- Expected behaviour: Enterprise Architects no longer appear in Cloud Architect match lists unless they have the actual required cloud-architecture skills declared.

### 4.8.b — Application history endpoint + UI
- **Backend**: new `GET /api/v1/candidates/:id/history`. Returns all candidates sharing `waNumberHash` OR `email` within the same agency, excluding the current record. Pattern mirrors `checkReturningCandidate` at `score-candidate.ts:145-169`.
- **Frontend**: in TP context of `CandidatePanel`, `useQuery(['candidate-history', id])` on drawer mount. Render as card list. Empty state: *"This is their first application."*
- Pairs with 4.8.a (section rename) from Sprint 2.

### 7.6.b — Domain Knowledge in overall formula
- Extend `shared/recommendations.ts` `recommendForL3` to include `interviewTechnicalScore` as a 4th dimension.
- Drawer: show Domain Knowledge score when `pipelineStage ∈ {interviewing, offered, hired}` and the field is populated.
- Does NOT build interview-score capture form (Phase 7). For demo, populate the field via API or seed.

---

## Sprint 5 — Data cleanup (~1h)

One-shot migrations + tighter queries. Run against dev DB; verify by inspection before claiming done.

### 4.3.a — Soft-close duplicate test jobs
One-shot SQL (or Prisma script): for each `(agencyId, title, hiringCompany)` combo with >1 active row, keep the most recent + any with bound non-rejected candidates, set `status='closed'` on the rest. Preserve candidate linkage; don't hard-delete.

### 7.6.a.iii — Talent Pool dedupe
File: `backend/src/core-api/routes/bulk-upload.ts` `/talent-pool/search` handler (or wherever the pool query lives).
- Collapse rows by `email` (primary) or `waNumberHash` (fallback when email is null).
- Show one row per unique identity. Aggregate fields: latest pipelineStage, max compositeScore, count of applications (hover/expand shows breakdown).
- Candidates pool stays honest — one person = one row.

---

## Retest gate + release

After each sprint:
1. Commit with a scoped message (`fix(qa): Sprint N — ...`)
2. Push to `main`
3. Saad retests the sprint's tests against `HireIQ_QA_Test_Plan_v1.2.docx`
4. Any regressions → same-sprint hotfix commit
5. Move to next sprint

After Sprint 5:
- Full 85-test retest pass
- Update `QA_FIX_LOG.md` to mark shipped items as `shipped (commit hash)`
- Tag **v1.11.0**
- Update `CLAUDE.md` shipped history

## Outside this plan

**Awaiting from Saad**: HireIQ logo (PNG/SVG, ≥ 512×512) for 1.1.a favicon. Drop into `frontend/src/app/favicon.ico` or `icon.png`.

**Phase 7 items** (documented in `QA_FIX_LOG.md`, not this plan):
3.10.b · 4.3.c · 4.4.c · 7.6.a.ii · 7.6.c · 7.7.c
