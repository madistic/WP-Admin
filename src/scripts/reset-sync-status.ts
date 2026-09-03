import prisma from "@/lib/prisma"

async function main() {
  const result = await prisma.menuItem.updateMany({
    where: {
      restaurant: { whatsapp_catalog_id: "2017236685593662" },
    },
    data: {
      meta_sync_status: null,
      meta_product_sku: null,
    },
  })
  console.log(`✓ Reset ${result.count} menu item(s) — meta_sync_status and meta_product_sku cleared.`)
  console.log("On the next 'Hi', the router will trigger a fresh sync to catalog 2017236685593662.")
}

main()
  .catch((e) => {
    console.error("Reset failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
