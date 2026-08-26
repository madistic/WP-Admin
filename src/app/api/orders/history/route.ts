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

    const orders = await prisma.order.findMany({
      where: {
        restaurant_id: session.user.restaurant_id,
        status: { in: ["DELIVERED", "REJECTED", "CANCELLED"] },
      },
      include: {
        items: true,
        history: {
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: { updated_at: "desc" },
      take: 50,
    })

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Fetch Order History Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
