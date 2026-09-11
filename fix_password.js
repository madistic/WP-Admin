const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const pg = require('pg');

async function fixPassword() {
  const client = new pg.Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const hash = await bcrypt.hash('password123', 10);
  await client.query('UPDATE "User" SET password_hash = $1 WHERE email = $2', [hash, 'admin@spiceroute.com']);
  console.log("Password reset to password123 for admin@spiceroute.com");

  await client.end();
}

fixPassword().catch(console.error).finally(() => process.exit(0));
