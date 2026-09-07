import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { deleteProductFromMetaCatalog } from "@/lib/whatsapp/catalog"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action, item_ids } = body

    if (!action || !item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return NextResponse.json({ error: "Action and item_ids array are required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    // Rule 15: Scoped to restaurant_id
    const targetItems = await prisma.menuItem.findMany({
      where: {
        id: { in: item_ids },
        restaurant_id: restaurantId,
      },
      select: { id: true },
    })

    const validIds = targetItems.map((i) => i.id)

    if (action === "activate") {
      await prisma.menuItem.updateMany({
        where: { id: { in: validIds } },
        data: { is_active: true },
      })
    } else if (action === "deactivate") {
      await prisma.menuItem.updateMany({
        where: { id: { in: validIds } },
        data: { is_active: false },
      })
    } else if (action === "mark_available") {
      await prisma.menuItem.updateMany({
        where: { id: { in: validIds } },
        data: { is_available: true },
      })
    } else if (action === "mark_out_of_stock") {
      await prisma.menuItem.updateMany({
        where: { id: { in: validIds } },
        data: { is_available: false },
      })
    } else if (action === "delete") {
      const itemsToDelete = await prisma.menuItem.findMany({
        where: { id: { in: validIds }, restaurant_id: restaurantId },
        include: { restaurant: true, variants: true },
      })

      let archivedCount = 0
      let deletedCount = 0
      await prisma.$transaction(async (tx) => {
        await tx.categoryItemSelection.deleteMany({ where: { menu_item_id: { in: validIds } } })
        await tx.whatsAppCartItem.deleteMany({ where: { menu_item_id: { in: validIds } } })

        const referencedItems = await tx.orderItem.findMany({
          where: { menu_item_id: { in: validIds } },
          select: { menu_item_id: true },
          distinct: ["menu_item_id"],
        })
        const referencedIds = referencedItems.map((item) => item.menu_item_id)
        const unusedIds = validIds.filter((id) => !referencedIds.includes(id))

        if (referencedIds.length > 0) {
          const archived = await tx.menuItem.updateMany({
            where: { id: { in: referencedIds }, restaurant_id: restaurantId },
            data: {
              is_active: false,
              is_available: false,
              is_today_special: false,
              special_until_date: null,
              deleted_at: new Date(),
            },
          })
          archivedCount = archived.count
        }

        if (unusedIds.length > 0) {
          const deleted = await tx.menuItem.deleteMany({
            where: { id: { in: unusedIds }, restaurant_id: restaurantId },
          })
          deletedCount = deleted.count
        }
      })

      const catalogResults = await Promise.allSettled(itemsToDelete.map(async (item) => {
        const catalogId = item.restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
        if (!item.meta_product_sku || !catalogId) return []

        const results = await Promise.all([
          deleteProductFromMetaCatalog(catalogId, item.meta_product_sku, item.name),
          ...item.variants.map((variant) => deleteProductFromMetaCatalog(
            catalogId,
            `${item.meta_product_sku}__var__${variant.id}`,
            `${item.name} [${variant.name}]`
          )),
        ])
        return results
      }))
      const catalogErrors = catalogResults.flatMap((result) => {
        if (result.status === "rejected") return [result.reason instanceof Error ? result.reason.message : "Catalog cleanup failed"]
        return result.value.filter((result) => !result.success).map((result) => result.error || "Catalog cleanup failed")
      })

      return NextResponse.json({
        success: true,
        count: validIds.length,
        archivedCount,
        deletedCount,
        catalogWarnings: catalogErrors,
      })
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ success: true, count: validIds.length })
  } catch (error: unknown) {
    console.error("Bulk Action Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk action failed" },
      { status: 500 }
    )
  }
}
