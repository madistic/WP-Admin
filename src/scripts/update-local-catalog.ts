import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/restaurant_db?schema=public';

async function updateLocalDbCatalog() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Local PostgreSQL DB');

    const res = await client.query(`
      UPDATE "Restaurant" 
      SET "whatsapp_catalog_id" = '2017236685593662' 
      WHERE "whatsapp_catalog_id" IS NULL OR "whatsapp_catalog_id" != '2017236685593662';
    `);
    console.log(`✓ Updated ${res.rowCount} restaurant record(s) with whatsapp_catalog_id = 2017236685593662`);

    const check = await client.query(`SELECT id, name, "whatsapp_catalog_id" FROM "Restaurant";`);
    console.log('Current Restaurants in Local DB:', check.rows);
  } catch (err) {
    console.error('Local DB update error:', err);
  } finally {
    await client.end();
  }
}

updateLocalDbCatalog();
