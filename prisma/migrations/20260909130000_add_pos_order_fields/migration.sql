ALTER TYPE "OrderSource" ADD VALUE 'POS';
ALTER TYPE "OrderType" ADD VALUE 'DINING';

ALTER TABLE "Order"
ADD COLUMN "table_number" TEXT,
ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "Order_restaurant_id_client_request_id_key"
ON "Order"("restaurant_id", "client_request_id");