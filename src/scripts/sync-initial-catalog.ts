import prisma from "@/lib/prisma"
import { syncRestaurantCatalog } from "@/lib/whatsapp/catalog"

async function runInitialCatalogSync() {
  console.log("=========================================")
  console.log("STARTING INITIAL META CATALOG SYNC")
  console.log("=========================================\n")

  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, whatsapp_catalog_id: true },
  })

  console.log(`Found ${restaurants.length} restaurant(s) in PostgreSQL database.\n`)

  for (const r of restaurants) {
    const catalogId = r.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID || "1881755926567241"
    console.log(`Syncing menu items for '${r.name}' (Catalog ID: ${catalogId})...`)

    const result = await syncRestaurantCatalog(r.id)
    console.log(`✓ Finished '${r.name}': ${result.synced}/${result.total} items synced successfully (${result.failed} failed).\n`)
  }

  console.log("=========================================")
  console.log("INITIAL META CATALOG SYNC COMPLETE")
  console.log("=========================================")
}

runInitialCatalogSync()
  .catch((err) => {
    console.error("Initial catalog sync failed:", err)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
