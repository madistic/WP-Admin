import pg from "pg"

async function run() {
  const client = new pg.Client({ connectionString: "postgresql://postgres:admin@localhost:5432/restaurant_db?schema=public" })
  await client.connect()

  console.log("Applying schema migrations...")

  await client.query(`
    -- Add columns to Customer
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "profile_image" TEXT;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3);
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gender" TEXT;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "last_order_at" TIMESTAMP(3);

    -- Add columns to CustomerAddress
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "address_type" TEXT NOT NULL DEFAULT 'Home';
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "label" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "recipient_name" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "address_line_2" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "state" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "delivery_instructions" TEXT;
    ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;

    -- Create CustomerNote
    CREATE TABLE IF NOT EXISTS "CustomerNote" (
      "id" TEXT NOT NULL,
      "customer_id" TEXT NOT NULL,
      "user_id" TEXT,
      "note" TEXT NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CustomerNote_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CustomerNote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    -- Create CustomerActivity
    CREATE TABLE IF NOT EXISTS "CustomerActivity" (
      "id" TEXT NOT NULL,
      "customer_id" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "metadata" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CustomerActivity_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `)

  // Assign existing customers to first restaurant if null
  const res = await client.query(`SELECT id FROM "Restaurant" LIMIT 1;`)
  if (res.rows.length > 0) {
    const restaurantId = res.rows[0].id
    await client.query(`UPDATE "Customer" SET "restaurant_id" = $1 WHERE "restaurant_id" IS NULL;`, [restaurantId])
  }

  // Enforce NOT NULL and unique constraint on Customer(restaurant_id, phone)
  await client.query(`
    ALTER TABLE "Customer" ALTER COLUMN "restaurant_id" SET NOT NULL;
    ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_restaurant_id_fkey";
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    CREATE UNIQUE INDEX IF NOT EXISTS "Customer_restaurant_id_phone_key" ON "Customer"("restaurant_id", "phone");
  `)

  console.log("Migration executed successfully!")
  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
