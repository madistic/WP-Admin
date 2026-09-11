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

async function queryCounts() {
  const result = await client.query(`
    SELECT 'Order' AS table_name, COUNT(*)::int AS count FROM "Order"
    UNION ALL SELECT 'OrderItem', COUNT(*)::int FROM "OrderItem"
    UNION ALL SELECT 'OrderStatusHistory', COUNT(*)::int FROM "OrderStatusHistory"
    UNION ALL SELECT 'Restaurant', COUNT(*)::int FROM "Restaurant"
    UNION ALL SELECT 'User', COUNT(*)::int FROM "User"
    UNION ALL SELECT 'Customer', COUNT(*)::int FROM "Customer"
    UNION ALL SELECT 'MenuCategory', COUNT(*)::int FROM "MenuCategory"
    UNION ALL SELECT 'MenuItem', COUNT(*)::int FROM "MenuItem"
    UNION ALL SELECT 'MenuItemVariant', COUNT(*)::int FROM "MenuItemVariant"
    UNION ALL SELECT 'MenuItemAddon', COUNT(*)::int FROM "MenuItemAddon"
  `)

  return result.rows
}

async function main() {
  await client.connect()

  const before = await queryCounts()
  console.log("Before cleanup counts:")
  console.log(JSON.stringify(before, null, 2))

  await client.query("BEGIN")
  try {
    await client.query(`DELETE FROM "OrderStatusHistory"`)
    await client.query(`DELETE FROM "OrderItem"`)
    await client.query(`DELETE FROM "Order"`)
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }

  const after = await queryCounts()
  console.log("After cleanup counts:")
  console.log(JSON.stringify(after, null, 2))

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
