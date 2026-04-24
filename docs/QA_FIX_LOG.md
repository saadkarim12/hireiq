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
