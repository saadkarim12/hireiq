# CV Authenticity Scoring — Spec

How HireIQ flags AI-generated / fabricated CVs at the Applied stage. Score lives alongside `cvScreeningScore` and runs in the same `/score-cv` Claude call (no extra billing).

## Outputs persisted on `Candidate`

| Column | Type | Meaning |
|---|---|---|
| `authenticityScore` | SMALLINT (0-100) | Weighted total across the 6 signals below |
| `authenticityBand` | VARCHAR(20) | `authentic` (75-100) · `review` (50-74) · `fabricated` (<50) |
| `authenticityBreakdown` | JSONB | Per-signal score + one-line finding (see shape below) |
| `authenticityFlag` (legacy enum) | ENUM | Derived for back-compat: `authentic`→`none` · `review`→`medium` · `fabricated`→`high` |

`authenticityBreakdown` shape:

```json
{
  "signals": [
    { "id": 1, "name": "Achievement Specificity",   "score": 78, "weight": 0.25, "finding": "Most bullets cite metrics / named systems" },
    { "id": 2, "name": "Skill Timeline Coherence",  "score": 92, "weight": 0.20, "finding": "5 of 5 listed skills traced to dated roles" },
    { "id": 3, "name": "Internal Consistency",      "score": 85, "weight": 0.20, "finding": "Seniority + duties + progression align" },
    { "id": 4, "name": "Linguistic Genericity",     "score": 70, "weight": 0.15, "finding": "Some AI-typical phrasing in summary" },
    { "id": 5, "name": "Structural Templating",     "score": 80, "weight": 0.10, "finding": "Bullet length varies naturally" },
    { "id": 6, "name": "JD Keyword Mirroring",      "score": 75, "weight": 0.10, "finding": "Vocabulary not unusually template-like" }
  ],
  "topConcerns": ["Linguistic Genericity"],
  "rationale": "One-paragraph synthesis from Claude"
}
```

## The 6 signals

### 1. Achievement Specificity — 25%
**Measures**: are accomplishments backed by metrics, dates, named systems, named teams, scope?
**Method**: per-bullet specificity-marker count (numbers, dates, named systems, named outcomes). <30% of bullets carrying ≥1 marker → high concern.
- ✅ Low (good): *"Reduced AWS costs from $52K to $34K monthly (35%) by migrating idle EC2 to Lambda"* (5 markers)
- ❌ High (concern): *"Improved performance significantly across multiple workstreams"* (0 markers)
- **False-positive risk**: Low — vague writers benefit from being flagged anyway.

### 2. Skill Timeline Coherence — 20%
**Measures**: are listed skills traceable to dated employment/projects, or floating with no anchor?
**Method**: cross-reference Skills section vs. work-experience descriptions. Match in dated role = coherent. <40% match → stuffing.
- ✅ Low: 5 skills listed, all 5 appear in dated work descriptions (100%)
- ❌ High: 22 skills listed, only 2 (Python, AWS) appear in any role
- **False-positive risk**: Very low — deterministic check.

### 3. Internal Consistency — 20%
**Measures**: do claimed seniority, dates, and project depth align logically?
**Method**: seniority vs. duties match · realistic career progression.
- ✅ Low: Junior (2y) → Mid (2y) → Senior (2y) at same company; duties match each level
- ❌ High: "Lead Architect, 4 yrs exp" but projects describe junior tasks (learning JS, bug fixes)
- **False-positive risk**: Low — catches both AI and human inflation.

### 4. Linguistic Genericity — 15%
**Measures**: density of AI-typical vocabulary (*leveraged, spearheaded, synergies, drove transformative outcomes*) vs. concrete language.
**Method**: count LLM-marker words per 100 words. 6+ per 100 = high signal.
- ✅ Low: *"Migrated 12 services to AWS over 8 months. Cut bills from $48K to $31K monthly"* (0 markers)
- ❌ High: *"Spearheaded transformative cloud initiatives leveraging cutting-edge synergies"* (8 in 38 words)
- **False-positive risk**: Medium — some senior execs / consultants write this way naturally.

### 5. Structural Templating — 10%
**Measures**: does CV STRUCTURE match AI default outputs (em-dashes, uniform bullets, default heading order)?
**Method**: formatting fingerprints — bullet-length variance, em-dash count, heading order, *"Key Achievements:"* labels.
- ✅ Low: inconsistent dates (*"Mar 2022"* vs *"(Jan 2019)"*), casual asides, skill annotations
- ❌ High: all bullets exactly 12-15 words; em-dashes throughout; canonical heading order; *"Key Achievements:"* labels
- **False-positive risk**: Medium-High — humans using ChatGPT to format their own CV inherit this.
- **HireIQ caveat**: we parse-and-discard the raw PDF, so the structured-JSON we score is already normalised. Signal is muted here — Claude can still spot AI-typical bullet wording but loses fingerprints like em-dashes.

### 6. JD Keyword Mirroring — 10%
**Measures**: does CV vocabulary match generic role-template phrases abnormally tightly?
**Method**: compare against generic role corpus (NOT the active JD — that biases the gate). >40% verbatim match → template-like.
- ✅ Low: 0-1 generic phrases; mostly idiosyncratic language
- ❌ High: 14 of 16 phrases from generic *"Senior Cloud Architect"* template verbatim
- **False-positive risk**: Low when compared against generic corpus; risky if compared against active JD.

## Output bands

| Score | Badge | Recruiter sees | Action |
|---|---|---|---|
| 75-100 | 🟢 **Authentic** | "No authenticity concerns detected" | Proceed normally |
| 50-74  | 🟡 **Review**    | "Some concerns: [top 2 signals]"     | Flagged for human review |
| <50    | 🔴 **Likely Fabricated** | "Multiple concerns: [all triggered signals]" | Strongly recommend manual verification |

## Where it runs

- **`POST /api/v1/ai/score-cv`** — fires at the Applied stage on every CV (bulk-upload, public-apply, Talent Pool re-score). Authenticity scoring is part of the same Claude tool call as the CV-vs-job scoring, so no extra billing.
- **`POST /api/v1/ai/preview-score-cv`** — Talent Pool dry-run returns the same authenticity payload (not persisted).

## Where it surfaces

- **CandidatePanel drawer** — band badge sits next to the headline cvScreening score; click-to-expand shows per-signal table + Claude's rationale.
- **Pipeline kanban card** — replaces the legacy "⚠️ AI-polished" chip with a banded dot (🟢/🟡/🔴) so recruiters can spot fabricated CVs at a glance.
- **CV Inbox row** — same dot in the score cell.

## Not in scope (Phase 7 ideas)

- Per-signal threshold tuning UI for agency admins.
- Comparison against a corpus of *this agency's* historic fabricated CVs (signal #6 done locally).
- Backfill across the existing pool — current implementation only scores new CVs.
