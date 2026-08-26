import pg from "pg"

async function run() {
  const client = new pg.Client({ connectionString: "postgresql://postgres:admin@localhost:5432/restaurant_db?schema=public" })
  await client.connect()

  console.log("Applying schema migrations for Menu Management...")

  await client.query(`
    -- Add columns to MenuItem
    ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "prep_time_minutes" INTEGER DEFAULT 15;
    ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "is_today_special" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "special_until_date" TIMESTAMP(3);
    ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "is_bestseller" BOOLEAN NOT NULL DEFAULT false;

    -- Create MenuItemVariant
    CREATE TABLE IF NOT EXISTS "MenuItemVariant" (
      "id" TEXT NOT NULL,
      "menu_item_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "price" DOUBLE PRECISION NOT NULL,
      "is_available" BOOLEAN NOT NULL DEFAULT true,
      "sort_order" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "MenuItemVariant_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- Create MenuItemAddon
    CREATE TABLE IF NOT EXISTS "MenuItemAddon" (
      "id" TEXT NOT NULL,
      "menu_item_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "price" DOUBLE PRECISION NOT NULL,
      "is_available" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MenuItemAddon_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "MenuItemAddon_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `)

  console.log("Menu migrations executed successfully!")
  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
