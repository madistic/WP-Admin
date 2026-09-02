import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemToMetaCatalog } from "@/lib/whatsapp/catalog"

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

    // Trigger Meta Catalog sync
    syncMenuItemToMetaCatalog(updated.id).catch((err) =>
      console.error("[Menu API] Catalog sync error on update:", err)
    )

    return NextResponse.json(updated)
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
    })

    if (!existing) return NextResponse.json({ error: "Menu item not found" }, { status: 404 })

    // Sync out of stock/disabled status to Meta Catalog before DB delete
    await syncMenuItemToMetaCatalog(existing.id).catch((err) =>
      console.error("[Menu API] Catalog sync error on delete:", err)
    )

    await prisma.menuItem.delete({
      where: { id: itemId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete Menu Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
