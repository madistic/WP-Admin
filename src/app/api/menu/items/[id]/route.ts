import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  syncMenuItemToMetaCatalog,
  deleteProductFromMetaCatalog,
} from "@/lib/whatsapp/catalog"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const restaurantId = session.user.restaurant_id

    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurant_id: restaurantId },
    })

    if (!existing) return NextResponse.json({ error: "Menu item not found" }, { status: 404 })

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(body.category_id !== undefined && { category_id: body.category_id }),
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.price !== undefined && { price: parseFloat(body.price) }),
        ...(body.image_url !== undefined && { image_url: body.image_url?.trim() || null }),
        ...(body.is_available !== undefined && { is_available: Boolean(body.is_available) }),
        ...(body.is_active !== undefined && { is_active: Boolean(body.is_active) }),
        ...(body.is_veg !== undefined && { is_veg: Boolean(body.is_veg) }),
        ...(body.prep_time_minutes !== undefined && { prep_time_minutes: body.prep_time_minutes ? parseInt(body.prep_time_minutes, 10) : null }),
        ...(body.is_today_special !== undefined && { is_today_special: Boolean(body.is_today_special) }),
        ...(body.special_until_date !== undefined && { special_until_date: body.special_until_date ? new Date(body.special_until_date) : null }),
        ...(body.is_bestseller !== undefined && { is_bestseller: Boolean(body.is_bestseller) }),
        ...(body.sort_order !== undefined && { sort_order: Number(body.sort_order) }),
      },
      include: {
        category: true,
        variants: true,
        addons: true,
      },
    })

    // Sync updated product to Meta Catalog (uses stable retailer_id, verifies after sync)
    const syncResult = await syncMenuItemToMetaCatalog(updated.id)
    if (syncResult.success) {
      console.log(`[Meta Catalog Sync] UPDATE succeeded for '${updated.name}' (id: ${updated.id})`)
    } else {
      console.warn(`[Meta Catalog Sync] UPDATE failed for '${updated.name}' (id: ${updated.id}): ${syncResult.error}`)
    }

    // Re-fetch to return current meta_sync_status to the UI
    const updatedWithSyncStatus = await prisma.menuItem.findUnique({
      where: { id: updated.id },
      include: { category: true, variants: true, addons: true },
    })

    return NextResponse.json(updatedWithSyncStatus)
  } catch (error: any) {
    console.error("Update Menu Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const restaurantId = session.user.restaurant_id

    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurant_id: restaurantId },
      include: { restaurant: true },
    })

    if (!existing) return NextResponse.json({ error: "Menu item not found" }, { status: 404 })

    // Resolve catalog ID for this restaurant
    const catalogId =
      existing.restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID

    // Stable retailer_id that was used when the product was synced to Meta
    const retailerId = existing.meta_product_sku

    if (retailerId && catalogId) {
      // Step 1: Delete from Meta Catalogue FIRST
      const metaDeleteResult = await deleteProductFromMetaCatalog(
        catalogId,
        retailerId,
        existing.name
      )

      if (!metaDeleteResult.success) {
        // Do NOT delete the DB record — preserve it so the admin can retry
        console.error(
          `[Meta Catalog Delete] Failed to delete '${existing.name}' (retailer_id: ${retailerId}) from Meta. DB record preserved for retry. Error: ${metaDeleteResult.error}`
        )
        return NextResponse.json(
          {
            error: `Failed to remove product from Meta Catalogue: ${metaDeleteResult.error}. The menu item has been preserved — please retry deletion.`,
          },
          { status: 502 }
        )
      }

      console.log(
        `[Meta Catalog Delete] Product '${existing.name}' (retailer_id: ${retailerId}) removed from Meta. Proceeding to delete DB record.`
      )
    } else {
      // No Meta product was ever synced — skip Meta deletion entirely
      console.log(
        `[Meta Catalog Delete] '${existing.name}' has no meta_product_sku — skipping Meta deletion, proceeding to delete DB record.`
      )
    }

    // Step 2: Only delete DB record after Meta deletion confirmed (or item was never synced)
    await prisma.menuItem.delete({
      where: { id: itemId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete Menu Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
