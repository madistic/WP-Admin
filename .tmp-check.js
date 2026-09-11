const fs=require("fs");
const {Client}=require("pg");
const env=fs.readFileSync(".env","utf8");
const m = env.match(/DATABASE_URL\s*=\s*"([^"]+)"/);
const conn = m[1];
(async()=>{
  const client = new Client({connectionString: conn, ssl:{rejectUnauthorized:false}});
  await client.connect();
  const counts = await client.query(`
    SELECT 'Order' AS table_name, COUNT(*)::int AS count FROM "Order"
    UNION ALL SELECT 'OrderItem', COUNT(*)::int FROM "OrderItem"
    UNION ALL SELECT 'OrderStatusHistory', COUNT(*)::int FROM "OrderStatusHistory"
    UNION ALL SELECT 'Restaurant', COUNT(*)::int FROM "Restaurant"
    UNION ALL SELECT 'Branch', COUNT(*)::int FROM "Branch"
    UNION ALL SELECT 'Customer', COUNT(*)::int FROM "Customer"
    UNION ALL SELECT 'MenuCategory', COUNT(*)::int FROM "MenuCategory"
    UNION ALL SELECT 'MenuItem', COUNT(*)::int FROM "MenuItem"
    UNION ALL SELECT 'MenuItemVariant', COUNT(*)::int FROM "MenuItemVariant"
    UNION ALL SELECT 'MenuItemAddon', COUNT(*)::int FROM "MenuItemAddon"
  `);
  console.log(JSON.stringify(counts.rows, null, 2));
  await client.end();
})();
