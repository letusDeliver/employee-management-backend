-- DropIndex
DROP INDEX "Employee_userId_key";

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
-- Partial unique index: enforces "at most one non-deleted Employee per
-- userId" without permanently locking a userId out of reuse once its
-- Employee record is soft-deleted. Prisma's schema DSL has no syntax for
-- partial unique constraints, hence this hand-written SQL rather than a
-- schema.prisma @@unique attribute.
CREATE UNIQUE INDEX "Employee_userId_active_key" ON "Employee"("userId") WHERE "deletedAt" IS NULL;
