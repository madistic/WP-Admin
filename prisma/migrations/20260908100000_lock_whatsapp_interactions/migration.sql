ALTER TABLE "WhatsAppCart"
ADD COLUMN "processing_message_id" TEXT,
ADD COLUMN "processing_started_at" TIMESTAMP(3);

CREATE TABLE "WhatsAppMessageReceipt" (
    "message_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "WhatsAppMessageReceipt_pkey" PRIMARY KEY ("message_id")
);