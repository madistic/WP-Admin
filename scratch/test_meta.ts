import 'dotenv/config';

async function run() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
  const urls = [
    `https://graph.facebook.com/${version}/1204719431867562?fields=id,name`,
    `https://graph.facebook.com/${version}/1204719431867562/products?fields=id,name,retailer_id&limit=25`,
    `https://graph.facebook.com/${version}/1288433067690853?fields=id,display_phone_number`
  ];

  for (const url of urls) {
    console.log('GET', url);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('HTTP', res.status, res.ok ? 'OK' : 'ERROR', res.ok ? 'Success' : data?.error);
  }
}

run();
