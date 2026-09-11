import fs from "node:fs"
import { Client } from "pg"

const envText = fs.readFileSync(".env", "utf8")
const activeLine = envText
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.trim().startsWith("#") && line.trim().startsWith("DATABASE_URL="))

if (!activeLine) throw new Error("No active DATABASE_URL in .env")

const match = activeLine.match(/DATABASE_URL\s*=\s*"([^"]+)"/)
if (!match?.[1]) throw new Error("Could not parse DATABASE_URL from .env")

const connectionString = match[1]
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  const counts = await client.query(`
    SELECT 'Order' AS table_name, COUNT(*)::int AS count FROM "Order"
    UNION ALL SELECT 'OrderItem', COUNT(*)::int FROM "OrderItem"
    UNION ALL SELECT 'OrderStatusHistory', COUNT(*)::int FROM "OrderStatusHistory"
    UNION ALL SELECT 'Restaurant', COUNT(*)::int FROM "Restaurant"
    UNION ALL SELECT 'Branch', COUNT(*)::int FROM "Branch"
    UNION ALL SELECT 'User', COUNT(*)::int FROM "User"
    UNION ALL SELECT 'Customer', COUNT(*)::int FROM "Customer"
    UNION ALL SELECT 'MenuCategory', COUNT(*)::int FROM "MenuCategory"
    UNION ALL SELECT 'MenuItem', COUNT(*)::int FROM "MenuItem"
    UNION ALL SELECT 'MenuItemVariant', COUNT(*)::int FROM "MenuItemVariant"
    UNION ALL SELECT 'MenuItemAddon', COUNT(*)::int FROM "MenuItemAddon"
  `)

  const orderSamples = await client.query(`
    SELECT id, order_number, restaurant_id, branch_id, customer_id, status, created_at
    FROM "Order"
    ORDER BY created_at DESC
    LIMIT 20
  `)

  const dependentRecords = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "OrderItem") AS order_items,
      (SELECT COUNT(*) FROM "OrderStatusHistory") AS order_status_history,
      (SELECT COUNT(*) FROM "Order") AS orders
  `)

  const foreignKeys = await client.query(`
    SELECT conrelid::regclass::text AS child_table,
           conname AS constraint_name,
           pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid::regclass::text IN ('"OrderItem"', '"OrderStatusHistory"', '"Order"')
    ORDER BY child_table, constraint_name
  `)

  console.log(JSON.stringify({
    counts: counts.rows,
    dependentRecords: dependentRecords.rows[0],
    foreignKeys: foreignKeys.rows,
    orderSamples: orderSamples.rows,
  }, null, 2))

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
