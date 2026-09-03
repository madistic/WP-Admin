import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemToMetaCatalog } from "@/lib/whatsapp/catalog"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      category_id,
      name,
      description,
      price,
      image_url,
      is_available,
      is_active,
      is_veg,
      prep_time_minutes,
      is_today_special,
      special_until_date,
      is_bestseller,
      variants,
      addons,
    } = body

    if (!category_id || !name || price === undefined) {
      return NextResponse.json({ error: "Category, Name, and Price are required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    const count = await prisma.menuItem.count({ where: { restaurant_id: restaurantId } })

    const item = await prisma.menuItem.create({
      data: {
        restaurant_id: restaurantId,
        category_id,
        name: name.trim(),
        description: description?.trim() || null,
        price: parseFloat(price),
        image_url: image_url?.trim() || null,
        is_available: is_available ?? true,
        is_active: is_active ?? true,
        is_veg: is_veg ?? true,
        prep_time_minutes: prep_time_minutes ? parseInt(prep_time_minutes, 10) : 15,
        is_today_special: Boolean(is_today_special),
        special_until_date: special_until_date ? new Date(special_until_date) : null,
        is_bestseller: Boolean(is_bestseller),
        sort_order: count,
        variants: variants && Array.isArray(variants)
          ? {
              create: variants.map((v: any, index: number) => ({
                name: v.name,
                price: parseFloat(v.price),
                is_available: v.is_available ?? true,
                sort_order: index,
              })),
            }
          : undefined,
        addons: addons && Array.isArray(addons)
          ? {
              create: addons.map((a: any) => ({
                name: a.name,
                price: parseFloat(a.price),
                is_available: a.is_available ?? true,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        variants: true,
        addons: true,
      },
    })

    // Sync to Meta Commerce Catalog synchronously so retailer_id + status are persisted before response
    const syncResult = await syncMenuItemToMetaCatalog(item.id)
    if (syncResult.success) {
      console.log(`[Meta Catalog Sync] CREATE succeeded for '${item.name}' (id: ${item.id})`)
    } else {
      console.warn(`[Meta Catalog Sync] CREATE failed for '${item.name}' (id: ${item.id}): ${syncResult.error}`)
    }

    // Re-fetch to include updated meta_sync_status in the response
    const itemWithSyncStatus = await prisma.menuItem.findUnique({
      where: { id: item.id },
      include: { category: true, variants: true, addons: true },
    })

    return NextResponse.json(itemWithSyncStatus, { status: 201 })
  } catch (error: any) {
    console.error("Create Menu Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
