-- CV Authenticity Breakdown (CV-fabrication detection).
-- Adds a per-CV authenticity score and per-signal breakdown so recruiters
-- see WHY a CV is flagged, not just an opaque low/medium/high enum. The
-- legacy authenticity_flag column is retained and now derived from
-- authenticity_band for back-compat with existing UI surfaces.
--
-- authenticity_score   0-100 weighted total across the 6 signals
-- authenticity_band    'authentic' | 'review' | 'fabricated'
-- authenticity_breakdown  JSON: per-signal score + finding + topConcerns + rationale

ALTER TABLE "candidates" ADD COLUMN "authenticity_score"      SMALLINT;
ALTER TABLE "candidates" ADD COLUMN "authenticity_band"       VARCHAR(20);
ALTER TABLE "candidates" ADD COLUMN "authenticity_breakdown"  JSONB;
