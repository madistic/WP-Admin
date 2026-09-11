-- This migration records and replays the branch-aware schema changes that were already applied to the
-- live database, while remaining safe for existing data that was backfilled manually.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "Branch" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_enabled BOOLEAN NOT NULL DEFAULT true,
    delivery_free_distance_km DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    delivery_extra_charge_per_km DOUBLE PRECISION NOT NULL DEFAULT 10,
    delivery_charge_rounding TEXT NOT NULL DEFAULT 'PER_STARTED_KM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Branch_restaurant_id_code_key'
    ) THEN
        ALTER TABLE "Branch"
        ADD CONSTRAINT "Branch_restaurant_id_code_key" UNIQUE ("restaurant_id", "code");
    END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;
ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "CustomerActivity" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;
ALTER TABLE "CustomerActivity" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "WhatsAppCart" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "WhatsAppMessageReceipt" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;

INSERT INTO "Branch" (restaurant_id, name, code, address, phone, email, is_active, created_at, updated_at)
SELECT r.id, 'Main Branch', 'MAIN', r.address, r.phone, r.email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Restaurant" r
LEFT JOIN "Branch" b ON b.restaurant_id = r.id
WHERE b.id IS NULL
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'Role'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'UserRole'
    ) THEN
        ALTER TYPE "Role" RENAME TO "UserRole";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'UserRole' AND e.enumlabel = 'OWNER'
    ) THEN
        ALTER TYPE "UserRole" RENAME VALUE 'OWNER' TO 'SUPER_ADMIN';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'UserRole' AND e.enumlabel = 'MANAGER'
    ) THEN
        ALTER TYPE "UserRole" RENAME VALUE 'MANAGER' TO 'BRANCH_ADMIN';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'UserRole' AND e.enumlabel = 'STAFF'
    ) THEN
        ALTER TYPE "UserRole" RENAME VALUE 'STAFF' TO 'BRANCH_STAFF';
    END IF;
END $$;

UPDATE "User" u
SET branch_id = b.id
FROM "Branch" b
WHERE u.role <> 'SUPER_ADMIN'
  AND u.branch_id IS NULL
  AND b.restaurant_id = u.restaurant_id
  AND b.code = 'MAIN';

UPDATE "Customer" c
SET branch_id = b.id
FROM "Branch" b
WHERE c.branch_id IS NULL
  AND b.restaurant_id = c.restaurant_id
  AND b.code = 'MAIN';

UPDATE "CustomerAddress" ca
SET restaurant_id = c.restaurant_id,
    branch_id = b.id
FROM "Customer" c
JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
WHERE ca.customer_id = c.id
  AND (ca.restaurant_id IS NULL OR ca.branch_id IS NULL);

UPDATE "CustomerNote" cn
SET restaurant_id = c.restaurant_id,
    branch_id = b.id
FROM "Customer" c
JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
WHERE cn.customer_id = c.id
  AND (cn.restaurant_id IS NULL OR cn.branch_id IS NULL);

UPDATE "CustomerActivity" ca
SET restaurant_id = c.restaurant_id,
    branch_id = b.id
FROM "Customer" c
JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
WHERE ca.customer_id = c.id
  AND (ca.restaurant_id IS NULL OR ca.branch_id IS NULL);

UPDATE "Order" o
SET branch_id = b.id
FROM "Branch" b
WHERE o.branch_id IS NULL
  AND b.restaurant_id = o.restaurant_id
  AND b.code = 'MAIN';

UPDATE "WhatsAppCart" wc
SET branch_id = COALESCE(
      (
        SELECT b.id
        FROM "Branch" b
        WHERE b.restaurant_id = wc.restaurant_id
          AND b.code = 'MAIN'
        ORDER BY b.created_at
        LIMIT 1
      ),
      (
        SELECT b.id
        FROM "Branch" b
        ORDER BY b.created_at
        LIMIT 1
      )
    ),
    restaurant_id = COALESCE(
      (
        SELECT r.id
        FROM "Restaurant" r
        WHERE r.id = wc.restaurant_id
      ),
      (
        SELECT b.restaurant_id
        FROM "Branch" b
        ORDER BY b.created_at
        LIMIT 1
      )
    )
WHERE wc.branch_id IS NULL
   OR NOT EXISTS (
      SELECT 1
      FROM "Restaurant" r
      WHERE r.id = wc.restaurant_id
    );

UPDATE "WhatsAppMessageReceipt" wmr
SET branch_id = b.id
FROM "Branch" b
WHERE wmr.branch_id IS NULL
  AND b.restaurant_id = wmr.restaurant_id
  AND b.code = 'MAIN';

WITH ranked_orders AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY restaurant_id, branch_id, client_request_id
               ORDER BY created_at, id
           ) AS rn
    FROM "Order"
    WHERE client_request_id IS NOT NULL
)
DELETE FROM "Order" o
USING ranked_orders r
WHERE o.id = r.id
  AND r.rn > 1;

ALTER TABLE "Customer" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "CustomerAddress" ALTER COLUMN "restaurant_id" SET NOT NULL;
ALTER TABLE "CustomerAddress" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "CustomerNote" ALTER COLUMN "restaurant_id" SET NOT NULL;
ALTER TABLE "CustomerNote" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "CustomerActivity" ALTER COLUMN "restaurant_id" SET NOT NULL;
ALTER TABLE "CustomerActivity" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "WhatsAppCart" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "WhatsAppMessageReceipt" ALTER COLUMN "branch_id" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Branch_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "Branch"
        ADD CONSTRAINT "Branch_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'User_branch_id_fkey'
    ) THEN
        ALTER TABLE "User"
        ADD CONSTRAINT "User_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Customer_branch_id_fkey'
    ) THEN
        ALTER TABLE "Customer"
        ADD CONSTRAINT "Customer_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerAddress_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerAddress"
        ADD CONSTRAINT "CustomerAddress_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerAddress_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerAddress"
        ADD CONSTRAINT "CustomerAddress_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerNote_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerNote"
        ADD CONSTRAINT "CustomerNote_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerNote_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerNote"
        ADD CONSTRAINT "CustomerNote_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerActivity_branch_id_fkey'
    ) THEN
        ALTER TABLE "CustomerActivity"
        ADD CONSTRAINT "CustomerActivity_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CustomerActivity_restaurant_id_fkey'
    ) THEN
        ALTER TABLE "CustomerActivity"
        ADD CONSTRAINT "CustomerActivity_restaurant_id_fkey"
        FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Order_branch_id_fkey'
    ) THEN
        ALTER TABLE "Order"
        ADD CONSTRAINT "Order_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WhatsAppCart_branch_id_fkey'
    ) THEN
        ALTER TABLE "WhatsAppCart"
        ADD CONSTRAINT "WhatsAppCart_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WhatsAppMessageReceipt_branch_id_fkey'
    ) THEN
        ALTER TABLE "WhatsAppMessageReceipt"
        ADD CONSTRAINT "WhatsAppMessageReceipt_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "Branch" ("id") ON DELETE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_restaurant_id_branch_id_phone_key"
    ON "Customer" ("restaurant_id", "branch_id", "phone");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_restaurant_id_branch_id_client_request_id_key"
    ON "Order" ("restaurant_id", "branch_id", "client_request_id");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_key"
    ON "WhatsAppCart" ("restaurant_id", "branch_id", "customer_whatsapp_number");

CREATE INDEX IF NOT EXISTS "User_restaurant_id_branch_id_idx"
    ON "User" ("restaurant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "User_restaurant_id_role_idx"
    ON "User" ("restaurant_id", "role");

CREATE INDEX IF NOT EXISTS "Customer_restaurant_id_branch_id_idx"
    ON "Customer" ("restaurant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "Customer_branch_id_is_active_idx"
    ON "Customer" ("branch_id", "is_active");

CREATE INDEX IF NOT EXISTS "CustomerAddress_restaurant_id_branch_id_customer_id_idx"
    ON "CustomerAddress" ("restaurant_id", "branch_id", "customer_id");

CREATE INDEX IF NOT EXISTS "CustomerNote_restaurant_id_branch_id_customer_id_idx"
    ON "CustomerNote" ("restaurant_id", "branch_id", "customer_id");

CREATE INDEX IF NOT EXISTS "CustomerActivity_restaurant_id_branch_id_customer_id_idx"
    ON "CustomerActivity" ("restaurant_id", "branch_id", "customer_id");

CREATE INDEX IF NOT EXISTS "Order_restaurant_id_branch_id_created_at_idx"
    ON "Order" ("restaurant_id", "branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "Order_branch_id_status_created_at_idx"
    ON "Order" ("branch_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "WhatsAppCart_restaurant_id_branch_id_customer_whatsapp_number_idx"
    ON "WhatsAppCart" ("restaurant_id", "branch_id", "customer_whatsapp_number");

CREATE INDEX IF NOT EXISTS "WhatsAppMessageReceipt_restaurant_id_branch_id_status_idx"
    ON "WhatsAppMessageReceipt" ("restaurant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "Branch_restaurant_id_is_active_idx"
    ON "Branch" ("restaurant_id", "is_active");
