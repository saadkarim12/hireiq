-- CV Screening Refactor (v1.13.0).
-- Replaces the 40/40/20 relevancy/skills/experience CV-only scorer with a
-- two-factor semantic score: experience_score and skills_score, each 0-100,
-- averaged into cv_screening_score. Adds explicit phone_number extraction
-- and scoring_attempts for the no-CV-left-behind retry sweeper.
--
-- cv_match_score (legacy column) is retained because the post-WhatsApp
-- composite formula still uses it as the CV component. The new scorer
-- writes the same value to both cv_match_score and cv_screening_score
-- so downstream composite scoring is unaffected.

ALTER TABLE "candidates" ADD COLUMN "phone_number"        VARCHAR(30);
ALTER TABLE "candidates" ADD COLUMN "experience_score"    SMALLINT;
ALTER TABLE "candidates" ADD COLUMN "skills_score"        SMALLINT;
ALTER TABLE "candidates" ADD COLUMN "cv_screening_score"  SMALLINT;
ALTER TABLE "candidates" ADD COLUMN "scoring_attempts"    SMALLINT NOT NULL DEFAULT 0;
