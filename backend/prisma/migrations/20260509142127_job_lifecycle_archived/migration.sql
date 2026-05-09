-- Collapse JobStatus from {draft, active, paused, closed} to {draft, active, archived}.
-- Existing paused/closed rows are mapped to archived. closed_at column is renamed to archived_at.

-- 1. Rename the old enum so the new one can take its name.
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";

-- 2. Create the new enum.
CREATE TYPE "JobStatus" AS ENUM ('draft', 'active', 'archived');

-- 3. Drop the column default before retyping (Postgres won't ALTER through a default).
ALTER TABLE "jobs" ALTER COLUMN "status" DROP DEFAULT;

-- 4. Retype the column, mapping legacy paused/closed values to archived.
ALTER TABLE "jobs"
  ALTER COLUMN "status" TYPE "JobStatus"
  USING (
    CASE
      WHEN "status"::text IN ('paused', 'closed') THEN 'archived'::"JobStatus"
      ELSE "status"::text::"JobStatus"
    END
  );

-- 5. Restore the default.
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'draft';

-- 6. Drop the legacy enum.
DROP TYPE "JobStatus_old";

-- 7. Rename closed_at to archived_at to match the new lifecycle vocabulary.
ALTER TABLE "jobs" RENAME COLUMN "closed_at" TO "archived_at";
