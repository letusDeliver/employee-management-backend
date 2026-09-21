-- CreateEnum
CREATE TYPE "ExitCaseType" AS ENUM ('RESIGNATION', 'TERMINATION');

-- CreateEnum
CREATE TYPE "ExitCaseStatus" AS ENUM ('INITIATED', 'SEPARATED', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClearanceItemType" AS ENUM ('ASSET_RETURN', 'KNOWLEDGE_TRANSFER', 'FINAL_SETTLEMENT', 'ACCESS_REVOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ClearanceItemStatus" AS ENUM ('PENDING', 'DONE', 'WAIVED');

-- CreateTable
CREATE TABLE "ExitCase" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "ExitCaseType" NOT NULL,
    "status" "ExitCaseStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWorkingDay" DATE NOT NULL,
    "reason" TEXT,
    "eligibleForRehire" BOOLEAN,
    "rehireNote" TEXT,
    "separatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "initiatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearanceItem" (
    "id" TEXT NOT NULL,
    "exitCaseId" TEXT NOT NULL,
    "type" "ClearanceItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "assetId" TEXT,
    "status" "ClearanceItemStatus" NOT NULL DEFAULT 'PENDING',
    "waivedReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExitCase_employeeId_idx" ON "ExitCase"("employeeId");

-- CreateIndex
CREATE INDEX "ExitCase_status_idx" ON "ExitCase"("status");

-- CreateIndex
CREATE INDEX "ClearanceItem_exitCaseId_idx" ON "ClearanceItem"("exitCaseId");

-- CreateIndex
CREATE INDEX "ClearanceItem_assetId_idx" ON "ClearanceItem"("assetId");

-- AddForeignKey
ALTER TABLE "ExitCase" ADD CONSTRAINT "ExitCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitCase" ADD CONSTRAINT "ExitCase_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_exitCaseId_fkey" FOREIGN KEY ("exitCaseId") REFERENCES "ExitCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceItem" ADD CONSTRAINT "ClearanceItem_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ADR-EM02 / ExitCase invariant: at most one open (INITIATED or SEPARATED)
-- exit case per Employee, enforced at the DB level. Prisma's schema DSL
-- cannot express a partial unique index, so it is added by hand (same
-- mechanism as Employee.userId and AssetAssignment's active-row index).
CREATE UNIQUE INDEX "ExitCase_employeeId_open_key" ON "ExitCase"("employeeId") WHERE "status" IN ('INITIATED', 'SEPARATED');