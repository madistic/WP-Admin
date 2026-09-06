import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get("since")

    const whereClause: any = {
      restaurant_id: session.user.restaurant_id,
      status: "NEW",
    }

    if (since) {
      whereClause.created_at = {
        gt: new Date(since),
      }
    }

    const newOrders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        order_number: true,
        customer_name_snapshot: true,
        total: true,
        created_at: true,
      },
      take: 10, // Avoid pulling too many if they accumulated
    })

    return NextResponse.json(newOrders)
  } catch (error: any) {
    console.error("Fetch Latest Orders Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
