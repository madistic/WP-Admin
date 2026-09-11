const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env', 'utf8');
const line = env.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#') && l.trim().startsWith('DATABASE_URL='));
if (!line) throw new Error('No active DATABASE_URL');
const conn = line.match(/DATABASE_URL\s*=\s*"([^"]+)"/)[1];

(async () => {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})();
