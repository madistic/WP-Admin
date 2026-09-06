import { syncMenuItemToMetaCatalog } from "../src/lib/whatsapp/catalog";
import prisma from "../src/lib/prisma";

async function main() {
  const item = await prisma.menuItem.findFirst();
  if (!item) {
    console.log("No menu items found.");
    return;
  }
  console.log(`Syncing item ${item.id} - ${item.name}...`);
  const result = await syncMenuItemToMetaCatalog(item.id);
  console.log("Result:", result);
}

main().catch(console.error).finally(() => process.exit(0));
