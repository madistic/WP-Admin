-- Migration: Add CustomerAddress geocoding/distance fields and Order delivery snapshot fields
-- These fields are required by the WhatsApp delivery flow and branch-aware ordering system.
-- Safe to apply to production: all columns are nullable, no data loss.

-- CustomerAddress: Add geocoding and distance fields if missing
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "normalized_address" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "calculated_distance_km" DOUBLE PRECISION;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "distance_calculated_at" TIMESTAMP(3);
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "geocoding_provider" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "geocoding_metadata" TEXT;

-- Order: Add delivery snapshot fields if missing
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delivery_distance_km" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "free_delivery_distance_km" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delivery_charge" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delivery_charge_per_km" DOUBLE PRECISION;

-- Branch: Add max delivery distance field
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "delivery_max_distance_km" DOUBLE PRECISION;

-- WhatsAppCart: Add delivery quote JSON field
ALTER TABLE "WhatsAppCart" ADD COLUMN IF NOT EXISTS "delivery_quote" TEXT;

-- Fix FK ON UPDATE CASCADE for consistency with Prisma schema expectations
-- Drop and recreate FKs only if they don't already have ON UPDATE CASCADE
-- (PostgreSQL doesn't support ALTER CONSTRAINT for ON UPDATE directly, so we use IF NOT EXISTS guard)

DO $$
BEGIN
    -- Branch restaurant_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Branch_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "Branch" DROP CONSTRAINT "Branch_restaurant_id_fkey";
    END IF;
    ALTER TABLE "Branch" ADD CONSTRAINT "Branch_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- User branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_branch_id_fkey'
    ) THEN
        ALTER TABLE "User" DROP CONSTRAINT "User_branch_id_fkey";
    END IF;
    ALTER TABLE "User" ADD CONSTRAINT "User_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- Customer branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Customer_branch_id_fkey'
    ) THEN
        ALTER TABLE "Customer" DROP CONSTRAINT "Customer_branch_id_fkey";
    END IF;
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerAddress restaurant_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAddress_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_restaurant_id_fkey";
    END IF;
    ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerAddress branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAddress_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_branch_id_fkey";
    END IF;
    ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerAddress customer_id FK
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAddress_customer_id_fkey'
    ) THEN
        ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customer_id_fkey"
            FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- CustomerNote restaurant_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerNote_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerNote" DROP CONSTRAINT "CustomerNote_restaurant_id_fkey";
    END IF;
    ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerNote branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerNote_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerNote" DROP CONSTRAINT "CustomerNote_branch_id_fkey";
    END IF;
    ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerActivity restaurant_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerActivity_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerActivity" DROP CONSTRAINT "CustomerActivity_restaurant_id_fkey";
    END IF;
    ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- CustomerActivity branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomerActivity_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerActivity" DROP CONSTRAINT "CustomerActivity_branch_id_fkey";
    END IF;
    ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Order branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Order_branch_id_fkey'
    ) THEN
        ALTER TABLE "Order" DROP CONSTRAINT "Order_branch_id_fkey";
    END IF;
    ALTER TABLE "Order" ADD CONSTRAINT "Order_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- WhatsAppCart branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppCart_branch_id_fkey'
    ) THEN
        ALTER TABLE "WhatsAppCart" DROP CONSTRAINT "WhatsAppCart_branch_id_fkey";
    END IF;
    ALTER TABLE "WhatsAppCart" ADD CONSTRAINT "WhatsAppCart_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- WhatsAppMessageReceipt branch_id FK
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessageReceipt_branch_id_fkey'
    ) THEN
        ALTER TABLE "WhatsAppMessageReceipt" DROP CONSTRAINT "WhatsAppMessageReceipt_branch_id_fkey";
    END IF;
    ALTER TABLE "WhatsAppMessageReceipt" ADD CONSTRAINT "WhatsAppMessageReceipt_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;

-- Rename indexes to match Prisma-generated names (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_i'
    ) THEN
        ALTER INDEX "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_i"
            RENAME TO "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_numb_idx";
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_k'
    ) THEN
        ALTER INDEX "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_k"
            RENAME TO "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_numb_key";
    END IF;
END $$;

-- Drop the id DEFAULT for Branch if it has a gen_random_uuid() default (Prisma manages this differently)
ALTER TABLE "Branch" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Branch" ALTER COLUMN "updated_at" DROP DEFAULT;
