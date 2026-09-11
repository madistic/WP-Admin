import { Client } from 'pg'

const connectionString = process.env.DATABASE_URL

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
  console.log('TABLES')
  console.log(tables.rows.map((row) => row.table_name).join('\n'))

  const columns = await client.query("SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('Customer', 'CustomerAddress', 'CustomerActivity', 'CustomerNote', 'Order', 'WhatsAppCart', 'WhatsAppMessageReceipt', 'Branch', 'User') ORDER BY table_name, ordinal_position")
  console.log('\nCOLUMNS')
  console.log(JSON.stringify(columns.rows, null, 2))

  const userRoles = await client.query("SELECT role, COUNT(*)::int AS count FROM \"User\" GROUP BY role ORDER BY role")
  console.log('\nUSER_ROLES')
  console.log(JSON.stringify(userRoles.rows, null, 2))

  const users = await client.query("SELECT id, restaurant_id, role, email FROM \"User\" ORDER BY restaurant_id, email")
  console.log('\nUSERS')
  console.log(JSON.stringify(users.rows, null, 2))

  const restaurants = await client.query("SELECT id, name, slug, email, phone, created_at FROM \"Restaurant\" ORDER BY created_at")
  console.log('\nRESTAURANTS')
  console.log(JSON.stringify(restaurants.rows, null, 2))

  const branches = await client.query("SELECT id, restaurant_id, code, name FROM \"Branch\" ORDER BY restaurant_id, code")
  console.log('\nBRANCHES')
  console.log(JSON.stringify(branches.rows, null, 2))

  const nullBranchCounts = await client.query(`
    SELECT
      'Customer' AS table_name, COUNT(*)::int AS null_count FROM "Customer" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'CustomerAddress', COUNT(*)::int FROM "CustomerAddress" WHERE branch_id IS NULL OR restaurant_id IS NULL
    UNION ALL
    SELECT 'CustomerNote', COUNT(*)::int FROM "CustomerNote" WHERE branch_id IS NULL OR restaurant_id IS NULL
    UNION ALL
    SELECT 'CustomerActivity', COUNT(*)::int FROM "CustomerActivity" WHERE branch_id IS NULL OR restaurant_id IS NULL
    UNION ALL
    SELECT 'Order', COUNT(*)::int FROM "Order" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'WhatsAppCart', COUNT(*)::int FROM "WhatsAppCart" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'WhatsAppMessageReceipt', COUNT(*)::int FROM "WhatsAppMessageReceipt" WHERE branch_id IS NULL
    UNION ALL
    SELECT 'User', COUNT(*)::int FROM "User" WHERE branch_id IS NULL
  `)
  console.log('\nNULL_BRANCH_COUNTS')
  console.log(JSON.stringify(nullBranchCounts.rows, null, 2))

  const sampleNullCarts = await client.query("SELECT id, restaurant_id, customer_whatsapp_number, branch_id FROM \"WhatsAppCart\" WHERE branch_id IS NULL ORDER BY created_at LIMIT 20")
  console.log('\nSAMPLE_NULL_WHATSAPPCARTS')
  console.log(JSON.stringify(sampleNullCarts.rows, null, 2))

  const enums = await client.query("SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumlabel AS label FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY t.typname, e.enumsortorder")
  console.log('\nENUMS')
  console.log(JSON.stringify(enums.rows, null, 2))

  const migrations = await client.query("SELECT migration_name, started_at, finished_at FROM _prisma_migrations ORDER BY started_at")
  console.log('\nMIGRATIONS')
  console.log(JSON.stringify(migrations.rows, null, 2))

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
