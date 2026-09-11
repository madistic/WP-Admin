const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env','utf8');
const line = env.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#') && l.trim().startsWith('DATABASE_URL='));
if (!line) throw new Error('No DATABASE_URL');
const conn = line.match(/DATABASE_URL\s*=\s*"([^"]+)"/)[1];
(async () => {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tables = ['Order','OrderItem','OrderStatusHistory','Restaurant','User','Customer','MenuCategory','MenuItem','MenuItemVariant','MenuItemAddon','Branch','WhatsAppCart'];
  for (const table of tables) {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    console.log(`\nTABLE ${table}`);
    console.log(JSON.stringify(res.rows, null, 2));
  }
  await client.end();
})();
