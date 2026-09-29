-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "activityType" TEXT,
ADD COLUMN     "additionalInfo" TEXT,
ADD COLUMN     "applicationAddress" TEXT,
ADD COLUMN     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rejectionReason" TEXT;
