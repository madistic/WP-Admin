ALTER TABLE "WhatsAppMessageReceipt"
ADD COLUMN "interaction_message_id" TEXT;

UPDATE "WhatsAppMessageReceipt"
SET "interaction_message_id" = "message_id"
WHERE "interaction_message_id" IS NULL;

ALTER TABLE "WhatsAppMessageReceipt"
ALTER COLUMN "interaction_message_id" SET NOT NULL;

CREATE UNIQUE INDEX "WhatsAppMessageReceipt_interaction_message_id_key"
ON "WhatsAppMessageReceipt"("interaction_message_id");