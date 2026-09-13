-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- AlterTable
-- Temporary DEFAULT backfills every pre-existing Employee row to FULL_TIME
-- (docs/domain-employment-type.md has no free-text precursor to derive a
-- real value from - this is a one-time, explicit business assumption for
-- historical data, not a discovered fact, see the approved implementation
-- plan). The DROP DEFAULT immediately after removes it so every future
-- INSERT must specify employmentType explicitly (ADR-ET02: no unknown state).
ALTER TABLE "Employee" ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE "Employee" ALTER COLUMN "employmentType" DROP DEFAULT;
