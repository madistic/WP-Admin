import fs from 'node:fs'
import { Client } from 'pg'

function loadDatabaseUrl(): string {
  const envText = fs.readFileSync('.env', 'utf8')
  const activeLine = envText
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trim().startsWith('#') && line.trim().startsWith('DATABASE_URL'))

  if (!activeLine) {
    throw new Error('No active DATABASE_URL found in .env')
  }

  const match = activeLine.match(/DATABASE_URL\s*=\s*"([^"]+)"/)
  if (!match?.[1]) {
    throw new Error('Could not parse DATABASE_URL from .env')
  }

  return match[1]
}

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const validateQuery = `
    SELECT COUNT(*)::int AS null_branch_count
    FROM "WhatsAppCart"
    WHERE branch_id IS NULL
  `

  const initial = await client.query(validateQuery)
  console.log('Initial null branch rows:', initial.rows[0].null_branch_count)

  const sql = `
    WITH fallback_restaurant AS (
      SELECT id
      FROM "Restaurant"
      ORDER BY created_at
      LIMIT 1
    ),
    fallback_branch AS (
      SELECT b.id, b.restaurant_id
      FROM "Branch" b
      ORDER BY b.created_at
      LIMIT 1
    )
    UPDATE "WhatsAppCart" wc
    SET restaurant_id = COALESCE(
          (
            SELECT r.id
            FROM "Restaurant" r
            WHERE r.id = wc.restaurant_id
          ),
          (SELECT id FROM fallback_restaurant)
        ),
        branch_id = COALESCE(
          (
            SELECT b.id
            FROM "Branch" b
            WHERE b.restaurant_id = COALESCE(
              (
                SELECT r.id
                FROM "Restaurant" r
                WHERE r.id = wc.restaurant_id
              ),
              (SELECT id FROM fallback_restaurant)
            )
              AND b.code = 'MAIN'
            ORDER BY b.created_at
            LIMIT 1
          ),
          (
            SELECT b.id
            FROM "Branch" b
            WHERE b.restaurant_id = COALESCE(
              (
                SELECT r.id
                FROM "Restaurant" r
                WHERE r.id = wc.restaurant_id
              ),
              (SELECT id FROM fallback_restaurant)
            )
            ORDER BY b.created_at
            LIMIT 1
          ),
          (SELECT id FROM fallback_branch)
        )
    WHERE wc.branch_id IS NULL
       OR NOT EXISTS (
          SELECT 1
          FROM "Restaurant" r
          WHERE r.id = wc.restaurant_id
        );
  `

  await client.query(sql)

  const after = await client.query(validateQuery)
  console.log('Remaining null branch rows:', after.rows[0].null_branch_count)

  const invalidRestaurantRows = await client.query(`
    SELECT COUNT(*)::int AS invalid_count
    FROM "WhatsAppCart" wc
    LEFT JOIN "Restaurant" r ON r.id = wc.restaurant_id
    WHERE r.id IS NULL
  `)

  console.log('Invalid restaurant references:', invalidRestaurantRows.rows[0].invalid_count)

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
