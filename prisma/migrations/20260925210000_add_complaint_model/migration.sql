-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_restaurant_id_idx" ON "Complaint"("restaurant_id");

-- CreateIndex
CREATE INDEX "Complaint_restaurant_id_status_idx" ON "Complaint"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
