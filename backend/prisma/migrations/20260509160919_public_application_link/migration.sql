-- Public application link per job (v1.12.0).
-- Adds a high-entropy applicationToken (separate from the human-readable
-- applyUrlSlug, which stays for internal references), a kill-switch flag,
-- and an optional expiry. Existing jobs are backfilled with random tokens.

-- Required for gen_random_bytes (Postgres builtin in pgcrypto).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add token column nullable so we can backfill existing rows.
ALTER TABLE "jobs" ADD COLUMN "application_token" VARCHAR(64);

-- 2. Backfill: 32 bytes hex-encoded = 64 chars. Run per-row so each job
--    gets a unique token (gen_random_bytes is non-deterministic).
UPDATE "jobs"
SET "application_token" = encode(gen_random_bytes(32), 'hex')
WHERE "application_token" IS NULL;

-- 3. Lock down: NOT NULL + UNIQUE.
ALTER TABLE "jobs" ALTER COLUMN "application_token" SET NOT NULL;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_application_token_key" UNIQUE ("application_token");

-- 4. Kill-switch + expiry. Default-true so existing links work immediately
--    after migration without requiring a manual flip in the UI.
ALTER TABLE "jobs" ADD COLUMN "is_link_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "jobs" ADD COLUMN "link_expires_at" TIMESTAMP(3);
