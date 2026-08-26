import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { ordered_ids } = body // Array of category IDs in desired order

    if (!ordered_ids || !Array.isArray(ordered_ids)) {
      return NextResponse.json({ error: "ordered_ids array required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    for (let index = 0; index < ordered_ids.length; index++) {
      await prisma.menuCategory.updateMany({
        where: {
          id: ordered_ids[index],
          restaurant_id: restaurantId,
        },
        data: { sort_order: index },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Reorder Categories Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
