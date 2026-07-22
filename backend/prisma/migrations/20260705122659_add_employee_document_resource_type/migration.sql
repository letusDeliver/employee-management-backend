/*
  Warnings:

  - Added the required column `resourceType` to the `EmployeeDocument` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "resourceType" TEXT NOT NULL;
