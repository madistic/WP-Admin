import { Client } from 'pg'

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function run(query: string) {
  console.log(`Running: ${query.slice(0, 120)}${query.length > 120 ? '...' : ''}`)
  await client.query(query)
}

async function main() {
  await client.connect()

  await run(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)

  await run(`
    CREATE TABLE IF NOT EXISTS "Branch" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await run(`
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
  `)

  await run(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;`)
  await run(`ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;`)
  await run(`ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "CustomerActivity" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;`)
  await run(`ALTER TABLE "CustomerActivity" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "WhatsAppCart" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)
  await run(`ALTER TABLE "WhatsAppMessageReceipt" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;`)

  await run(`
    INSERT INTO "Branch" (restaurant_id, name, code, address, phone, email, is_active, created_at, updated_at)
    SELECT r.id, 'Main Branch', 'MAIN', r.address, r.phone, r.email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Restaurant" r
    LEFT JOIN "Branch" b ON b.restaurant_id = r.id
    WHERE b.id IS NULL;
  `)

  const roleTypeExists = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'UserRole'
    ) AS exists;
  `)
  const oldRoleTypeExists = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'Role'
    ) AS exists;
  `)

  if (oldRoleTypeExists.rows[0].exists && !roleTypeExists.rows[0].exists) {
    await run(`ALTER TYPE "Role" RENAME TO "UserRole";`)
    await run(`ALTER TYPE "UserRole" RENAME VALUE 'OWNER' TO 'SUPER_ADMIN';`)
    await run(`ALTER TYPE "UserRole" RENAME VALUE 'MANAGER' TO 'BRANCH_ADMIN';`)
    await run(`ALTER TYPE "UserRole" RENAME VALUE 'STAFF' TO 'BRANCH_STAFF';`)
  }

  await run(`
    UPDATE "User" u
    SET branch_id = b.id
    FROM "Branch" b
    WHERE u.role <> 'SUPER_ADMIN'
      AND u.branch_id IS NULL
      AND b.restaurant_id = u.restaurant_id
      AND b.code = 'MAIN';
  `)

  await run(`
    UPDATE "Customer" c
    SET branch_id = b.id
    FROM "Branch" b
    WHERE c.branch_id IS NULL
      AND b.restaurant_id = c.restaurant_id
      AND b.code = 'MAIN';
  `)

  await run(`
    UPDATE "CustomerAddress" ca
    SET restaurant_id = c.restaurant_id,
        branch_id = b.id
    FROM "Customer" c
    JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
    WHERE ca.customer_id = c.id
      AND (ca.restaurant_id IS NULL OR ca.branch_id IS NULL);
  `)

  await run(`
    UPDATE "CustomerNote" cn
    SET restaurant_id = c.restaurant_id,
        branch_id = b.id
    FROM "Customer" c
    JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
    WHERE cn.customer_id = c.id
      AND (cn.restaurant_id IS NULL OR cn.branch_id IS NULL);
  `)

  await run(`
    UPDATE "CustomerActivity" ca
    SET restaurant_id = c.restaurant_id,
        branch_id = b.id
    FROM "Customer" c
    JOIN "Branch" b ON b.restaurant_id = c.restaurant_id AND b.code = 'MAIN'
    WHERE ca.customer_id = c.id
      AND (ca.restaurant_id IS NULL OR ca.branch_id IS NULL);
  `)

  await run(`
    UPDATE "Order" o
    SET branch_id = b.id
    FROM "Branch" b
    WHERE o.branch_id IS NULL
      AND b.restaurant_id = o.restaurant_id
      AND b.code = 'MAIN';
  `)

  await run(`
    UPDATE "WhatsAppCart" wc
    SET branch_id = b.id
    FROM "Branch" b
    WHERE wc.branch_id IS NULL
      AND b.restaurant_id = wc.restaurant_id
      AND b.code = 'MAIN';
  `)

  await run(`
    UPDATE "WhatsAppCart" wc
    SET branch_id = (
      SELECT b.id
      FROM "Branch" b
      ORDER BY b.created_at
      LIMIT 1
    )
    WHERE wc.branch_id IS NULL;
  `)

  await run(`
    UPDATE "WhatsAppMessageReceipt" wmr
    SET branch_id = b.id
    FROM "Branch" b
    WHERE wmr.branch_id IS NULL
      AND b.restaurant_id = wmr.restaurant_id
      AND b.code = 'MAIN';
  `)

  await run(`ALTER TABLE "Customer" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerAddress" ALTER COLUMN "restaurant_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerAddress" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerNote" ALTER COLUMN "restaurant_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerNote" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerActivity" ALTER COLUMN "restaurant_id" SET NOT NULL;`)
  await run(`ALTER TABLE "CustomerActivity" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "Order" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "WhatsAppCart" ALTER COLUMN "branch_id" SET NOT NULL;`)
  await run(`ALTER TABLE "WhatsAppMessageReceipt" ALTER COLUMN "branch_id" SET NOT NULL;`)

  console.log('Backfill completed successfully.')
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
