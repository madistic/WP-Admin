import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurantId = session.user.restaurant_id
    const now = new Date()

    // 1. Reset expired Today's Specials automatically if special_until_date has passed
    await prisma.menuItem.updateMany({
      where: {
        restaurant_id: restaurantId,
        is_today_special: true,
        special_until_date: {
          lt: now,
        },
      },
      data: {
        is_today_special: false,
        special_until_date: null,
      },
    })

    // 2. Fetch all categories sorted by display order
    const categories = await prisma.menuCategory.findMany({
      where: { restaurant_id: restaurantId },
      orderBy: { sort_order: "asc" },
      include: {
        _count: { select: { items: true } },
      },
    })

    // 3. Fetch all items with variants and add-ons sorted by sort_order
    const items = await prisma.menuItem.findMany({
      where: { restaurant_id: restaurantId },
      include: {
        category: true,
        variants: { orderBy: { sort_order: "asc" } },
        addons: { orderBy: { created_at: "asc" } },
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
    })

    // 4. Calculate Menu Overview KPI Metrics
    const totalCategories = categories.length
    const totalItems = items.length
    const activeItems = items.filter((i) => i.is_active && i.category.is_active).length
    const inactiveItems = items.filter((i) => !i.is_active || !i.category.is_active).length
    const todaySpecials = items.filter((i) => i.is_today_special && i.is_active && i.is_available).length
    const outOfStockItems = items.filter((i) => !i.is_available).length

    return NextResponse.json({
      categories,
      items,
      stats: {
        totalCategories,
        totalItems,
        activeItems,
        inactiveItems,
        todaySpecials,
        outOfStockItems,
      },
    })
  } catch (error: any) {
    console.error("Fetch Menu Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
