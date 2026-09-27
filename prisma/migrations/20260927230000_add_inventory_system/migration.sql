-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING', 'PURCHASE', 'ADJUSTMENT', 'WASTAGE', 'ORDER_DEDUCTION', 'REVERSAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InventoryItem" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "opening_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "cost_per_unit" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MenuItemIngredient" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "inventory_item_id" TEXT NOT NULL,
    "order_id" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "previous_quantity" DECIMAL(12,3),
    "new_quantity" DECIMAL(12,3),
    "unit_cost" DECIMAL(10,2),
    "total_cost" DECIMAL(12,2),
    "reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryItem_restaurant_id_idx" ON "InventoryItem"("restaurant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryItem_branch_id_idx" ON "InventoryItem"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryItem_restaurant_id_branch_id_idx" ON "InventoryItem"("restaurant_id", "branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryItem_restaurant_id_is_active_idx" ON "InventoryItem"("restaurant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MenuItemIngredient_menu_item_id_inventory_item_id_key" ON "MenuItemIngredient"("menu_item_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MenuItemIngredient_menu_item_id_idx" ON "MenuItemIngredient"("menu_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MenuItemIngredient_inventory_item_id_idx" ON "MenuItemIngredient"("inventory_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_restaurant_id_idx" ON "InventoryTransaction"("restaurant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_branch_id_idx" ON "InventoryTransaction"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_inventory_item_id_idx" ON "InventoryTransaction"("inventory_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_order_id_idx" ON "InventoryTransaction"("order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_restaurant_id_created_at_idx" ON "InventoryTransaction"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryTransaction_type_idx" ON "InventoryTransaction"("type");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
