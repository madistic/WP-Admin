import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurant_id: session.user.restaurant_id,
      },
      include: {
        items: true,
        history: {
          orderBy: { created_at: "asc" },
        },
        customer: {
          include: {
            addresses: true,
            orders: {
              select: {
                id: true,
                total: true,
                created_at: true,
              },
            },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error: any) {
    console.error("Get Order Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
