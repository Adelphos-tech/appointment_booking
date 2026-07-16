/*
  Warnings:

  - You are about to drop the column `dutyDate` on the `Staff` table. All the data in the column will be lost.
  - Made the column `companyId` on table `Centre` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `dutyStartDate` to the `Staff` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('Permanent', 'Temporary');

-- DropForeignKey
ALTER TABLE "Centre" DROP CONSTRAINT "Centre_companyId_fkey";

-- AlterTable
ALTER TABLE "Centre" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "dutyDate",
ADD COLUMN     "dutyEndDate" TEXT,
ADD COLUMN     "dutyStartDate" TEXT NOT NULL,
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'Permanent',
ADD COLUMN     "workingDays" TEXT[] DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "centreIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "name" TEXT;

-- AddForeignKey
ALTER TABLE "Centre" ADD CONSTRAINT "Centre_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
