import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  syncMenuItemWithVariants,
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
    const syncResult = await syncMenuItemWithVariants(updated.id)
    if (syncResult.success) {
      console.log(`[Meta Catalog Sync] UPDATE succeeded for '${updated.name}' (id: ${updated.id})`)
    } else {
      console.warn(`[Meta Catalog Sync] UPDATE failed for '${updated.name}' (id: ${updated.id})`)
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
  let itemId = ""
  try {
    const { id } = await params
    itemId = id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) {
      return NextResponse.json({ error: "Menu item ID must be a UUID" }, { status: 400 })
    }
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const restaurantId = session.user.restaurant_id

    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurant_id: restaurantId },
      include: { restaurant: true, variants: true },
    })

    if (!existing) return NextResponse.json({ error: "Menu item not found" }, { status: 404 })

    const orderItemCount = await prisma.orderItem.count({ where: { menu_item_id: itemId } })

    // Resolve catalog ID for this restaurant.
    const catalogId =
      existing.restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID

    // Stable retailer_id that was used when the product was synced to Meta
    const retailerId = existing.meta_product_sku

    let archived = false
    await prisma.$transaction(async (tx) => {
      await tx.categoryItemSelection.deleteMany({ where: { menu_item_id: itemId } })
      await tx.whatsAppCartItem.deleteMany({ where: { menu_item_id: itemId } })

      const orderItemCount = await tx.orderItem.count({ where: { menu_item_id: itemId } })
      if (orderItemCount > 0) {
        archived = true
        await tx.menuItem.update({
          where: { id: itemId },
          data: {
            is_active: false,
            is_available: false,
            is_today_special: false,
            special_until_date: null,
            deleted_at: new Date(),
          },
        })
        return
      }

      await tx.menuItem.delete({ where: { id: itemId } })
    })

    if (retailerId && catalogId) {
      const productResult = await deleteProductFromMetaCatalog(catalogId, retailerId, existing.name)
      if (!productResult.success) {
        console.warn(`[Meta Catalog Delete] Failed for '${existing.name}': ${productResult.error}`)
      }

      for (const variant of existing.variants) {
        const variantResult = await deleteProductFromMetaCatalog(
          catalogId,
          `${retailerId}__var__${variant.id}`,
          `${existing.name} [${variant.name}]`
        )
        if (!variantResult.success) {
          console.warn(`[Meta Catalog Delete] Failed for variant '${variant.name}': ${variantResult.error}`)
        }
      }
    }

    return NextResponse.json({ success: true, archived })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      console.error("Delete Menu Item foreign-key constraint failed:", {
        code: error.code,
        meta: error.meta,
      })
      return NextResponse.json(
        { error: "Menu item cannot be deleted because related data still references it.", code: error.code },
        { status: 409 }
      )
    }

    const message = error instanceof Error ? error.message : "Unknown delete error"
    console.error("Delete Menu Item Error:", { itemId, error })
    return NextResponse.json({ error: "Failed to delete menu item", details: message }, { status: 500 })
  }
}
