import fs from "node:fs"
import { Client } from "pg"

function loadDatabaseUrl(): string {
  const envText = fs.readFileSync(".env", "utf8")
  const nonCommented = envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && line.startsWith("DATABASE_URL"))

  if (!nonCommented) {
    throw new Error("Active DATABASE_URL was not found in .env")
  }

  const match = nonCommented.match(/DATABASE_URL\s*=\s*"([^"]+)"/)

  if (!match?.[1]) {
    throw new Error("DATABASE_URL value could not be parsed from .env")
  }

  return match[1]
}

async function main() {
  const connectionString = loadDatabaseUrl()
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const statements = [
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION',
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION',
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS delivery_free_distance_km DOUBLE PRECISION NOT NULL DEFAULT 1.5',
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS delivery_extra_charge_per_km DOUBLE PRECISION NOT NULL DEFAULT 10',
    'ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS delivery_charge_rounding TEXT NOT NULL DEFAULT \'PER_STARTED_KM\'',
  ]

  for (const statement of statements) {
    await client.query(statement)
  }

  const result = await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'Branch\' ORDER BY ordinal_position'
  )

  console.log(JSON.stringify(result.rows, null, 2))
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
