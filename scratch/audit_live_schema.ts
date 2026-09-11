import fs from "node:fs"
import { Client } from "pg"

const envText = fs.readFileSync(".env", "utf8")
const activeLine = envText
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.trim().startsWith("#") && line.trim().startsWith("DATABASE_URL"))

if (!activeLine) {
  throw new Error("No active DATABASE_URL in .env")
}

const match = activeLine.match(/DATABASE_URL\s*=\s*"([^"]+)"/)
if (!match?.[1]) {
  throw new Error("Could not parse DATABASE_URL from .env")
}

const connectionString = match[1]
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  const liveColumns = await client.query(
    `
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('Restaurant','Branch','User','Customer','CustomerAddress','CustomerNote','CustomerActivity','MenuCategory','MenuItem','Order','OrderItem','OrderStatusHistory','WhatsAppCart','WhatsAppCartItem','WhatsAppMessageReceipt')
      ORDER BY table_name, ordinal_position
    `
  )

  const liveIndexes = await client.query(
    `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('Restaurant','Branch','User','Customer','CustomerAddress','CustomerNote','CustomerActivity','MenuCategory','MenuItem','Order','OrderItem','OrderStatusHistory','WhatsAppCart','WhatsAppCartItem','WhatsAppMessageReceipt')
      ORDER BY tablename, indexname
    `
  )

  const liveFks = await client.query(
    `
      SELECT conrelid::regclass::text AS table_name,
             conname AS constraint_name,
             pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid::regclass::text IN ('Restaurant','Branch','User','Customer','CustomerAddress','CustomerNote','CustomerActivity','MenuCategory','MenuItem','Order','OrderItem','OrderStatusHistory','WhatsAppCart','WhatsAppCartItem','WhatsAppMessageReceipt')
      ORDER BY table_name, constraint_name
    `
  )

  const migrations = await client.query(`
    SELECT migration_name, started_at, finished_at, checksum
    FROM _prisma_migrations
    ORDER BY started_at
  `)

  const counts = await client.query(`
    SELECT 'Restaurant' AS table_name, COUNT(*)::int AS count FROM "Restaurant"
    UNION ALL
    SELECT 'Branch', COUNT(*)::int FROM "Branch"
    UNION ALL
    SELECT 'User', COUNT(*)::int FROM "User"
    UNION ALL
    SELECT 'Customer', COUNT(*)::int FROM "Customer"
    UNION ALL
    SELECT 'CustomerAddress', COUNT(*)::int FROM "CustomerAddress"
    UNION ALL
    SELECT 'CustomerNote', COUNT(*)::int FROM "CustomerNote"
    UNION ALL
    SELECT 'CustomerActivity', COUNT(*)::int FROM "CustomerActivity"
    UNION ALL
    SELECT 'MenuCategory', COUNT(*)::int FROM "MenuCategory"
    UNION ALL
    SELECT 'MenuItem', COUNT(*)::int FROM "MenuItem"
    UNION ALL
    SELECT 'Order', COUNT(*)::int FROM "Order"
    UNION ALL
    SELECT 'OrderItem', COUNT(*)::int FROM "OrderItem"
    UNION ALL
    SELECT 'OrderStatusHistory', COUNT(*)::int FROM "OrderStatusHistory"
    UNION ALL
    SELECT 'WhatsAppCart', COUNT(*)::int FROM "WhatsAppCart"
    UNION ALL
    SELECT 'WhatsAppCartItem', COUNT(*)::int FROM "WhatsAppCartItem"
    UNION ALL
    SELECT 'WhatsAppMessageReceipt', COUNT(*)::int FROM "WhatsAppMessageReceipt"
  `)

  const nullBranchCounts = await client.query(`
    SELECT 'Customer' AS table_name, COUNT(*)::int AS null_count FROM "Customer" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'CustomerAddress', COUNT(*)::int FROM "CustomerAddress" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'CustomerNote', COUNT(*)::int FROM "CustomerNote" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'CustomerActivity', COUNT(*)::int FROM "CustomerActivity" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'Order', COUNT(*)::int FROM "Order" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'WhatsAppCart', COUNT(*)::int FROM "WhatsAppCart" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'WhatsAppMessageReceipt', COUNT(*)::int FROM "WhatsAppMessageReceipt" WHERE branch_id IS NULL
  `)

  console.log(JSON.stringify(
    {
      branchColumns: liveColumns.rows.filter((row) => row.table_name === "Branch"),
      liveIndexes: liveIndexes.rows,
      liveForeignKeys: liveFks.rows,
      migrations: migrations.rows,
      counts: counts.rows,
      nullBranchCounts: nullBranchCounts.rows,
    },
    null,
    2
  ))

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
