const pg = require('pg');

async function check() {
  const client = new pg.Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query('SELECT id, email, is_active, password_hash FROM "User"');
  console.log("Users in DB:");
  for (const u of res.rows) {
    console.log(`Email: ${u.email}, Active: ${u.is_active}, Hash: ${u.password_hash.substring(0, 20)}...`);
  }

  await client.end();
}

check();
