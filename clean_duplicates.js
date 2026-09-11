const pg = require('pg');

async function clean() {
  const client = new pg.Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log("Cleaning orphan WhatsAppCart records...");

  try {
    const res = await client.query(`
      DELETE FROM "WhatsAppCart"
      WHERE NOT EXISTS (
        SELECT 1 FROM "Restaurant" r WHERE r.id = "WhatsAppCart".restaurant_id
      );
    `);
    console.log(`Deleted ${res.rowCount} orphan WhatsAppCart records.`);
  } catch (e) {
    console.error("Error cleaning orphans", e);
  }

  await client.end();
}

clean();
