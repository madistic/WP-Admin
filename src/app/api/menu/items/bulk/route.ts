import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

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
      await prisma.menuItem.deleteMany({
        where: { id: { in: validIds } },
      })
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ success: true, count: validIds.length })
  } catch (error: any) {
    console.error("Bulk Action Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
