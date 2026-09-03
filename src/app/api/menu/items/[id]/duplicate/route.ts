import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemToMetaCatalog } from "@/lib/whatsapp/catalog"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { new_name, new_price } = body

    const restaurantId = session.user.restaurant_id

    const source = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurant_id: restaurantId },
      include: {
        variants: true,
        addons: true,
      },
    })

    if (!source) return NextResponse.json({ error: "Original menu item not found" }, { status: 404 })

    const count = await prisma.menuItem.count({ where: { restaurant_id: restaurantId } })

    // NOTE: meta_product_sku is intentionally NOT copied — the duplicate gets its
    // own new stable retailer_id (item.id) when syncMenuItemToMetaCatalog runs.
    const duplicated = await prisma.menuItem.create({
      data: {
        restaurant_id: restaurantId,
        category_id: source.category_id,
        name: new_name?.trim() || `${source.name} (Copy)`,
        description: source.description,
        price: new_price !== undefined ? parseFloat(new_price) : source.price,
        image_url: source.image_url,
        is_available: source.is_available,
        is_active: source.is_active,
        is_veg: source.is_veg,
        prep_time_minutes: source.prep_time_minutes,
        is_today_special: false, // reset special on duplicate
        is_bestseller: false, // reset bestseller on duplicate
        sort_order: count,
        variants: {
          create: source.variants.map((v) => ({
            name: v.name,
            price: v.price,
            is_available: v.is_available,
            sort_order: v.sort_order,
          })),
        },
        addons: {
          create: source.addons.map((a) => ({
            name: a.name,
            price: a.price,
            is_available: a.is_available,
          })),
        },
      },
      include: {
        category: true,
        variants: true,
        addons: true,
      },
    })

    // Sync the new duplicate as a separate Meta Catalogue product with its own retailer_id
    const syncResult = await syncMenuItemToMetaCatalog(duplicated.id)
    if (syncResult.success) {
      console.log(`[Meta Catalog Sync] Duplicate CREATE succeeded for '${duplicated.name}' (id: ${duplicated.id})`)
    } else {
      console.warn(`[Meta Catalog Sync] Duplicate CREATE failed for '${duplicated.name}' (id: ${duplicated.id}): ${syncResult.error}`)
    }

    // Re-fetch to include updated meta_sync_status in response
    const duplicatedWithSyncStatus = await prisma.menuItem.findUnique({
      where: { id: duplicated.id },
      include: { category: true, variants: true, addons: true },
    })

    return NextResponse.json(duplicatedWithSyncStatus, { status: 201 })
  } catch (error: any) {
    console.error("Duplicate Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

