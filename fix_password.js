const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const pg = require('pg');

async function fixPassword() {
  const client = new pg.Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const targetEmail = process.env.TARGET_EMAIL;
  const newPassword = process.env.NEW_PASSWORD;
  if (!targetEmail || !newPassword) {
    throw new Error("TARGET_EMAIL and NEW_PASSWORD environment variables are required.");
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await client.query('UPDATE "User" SET password_hash = $1 WHERE email = $2', [hash, targetEmail]);
  console.log(`Password reset successfully for ${targetEmail}`);

  await client.end();
}

fixPassword().catch(console.error).finally(() => process.exit(0));
