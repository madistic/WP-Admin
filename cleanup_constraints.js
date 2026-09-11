const pg = require('pg');

async function check() {
  const client = new pg.Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log("Dropping old unique constraints to allow branch update...");
  try {
    await client.query(`
      ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_restaurant_id_phone_key" CASCADE;
      DROP INDEX IF EXISTS "Customer_restaurant_id_phone_key" CASCADE;
      
      ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_restaurant_id_client_request_id_key" CASCADE;
      DROP INDEX IF EXISTS "Order_restaurant_id_client_request_id_key" CASCADE;
      
      ALTER TABLE "WhatsAppCart" DROP CONSTRAINT IF EXISTS "WhatsAppCart_restaurant_id_customer_whatsapp_number_key" CASCADE;
      DROP INDEX IF EXISTS "WhatsAppCart_restaurant_id_customer_whatsapp_number_key" CASCADE;
    `);
    console.log("Successfully dropped old constraints.");
  } catch (e) {
    console.error(e);
  }

  // Find duplicate WhatsAppCart under new unique key
  try {
    const res = await client.query(`
      SELECT restaurant_id, customer_whatsapp_number, COUNT(*)
      FROM "WhatsAppCart"
      GROUP BY restaurant_id, customer_whatsapp_number
      HAVING COUNT(*) > 1
    `);
    console.log("Duplicates in WhatsAppCart:", res.rows);
  } catch(e) {
    console.log("no whatsapp cart issue", e);
  }

  await client.end();
}

check();
