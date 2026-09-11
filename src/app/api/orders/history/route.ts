import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { OrderType, Prisma } from "@prisma/client"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get("status")  // DELIVERED | REJECTED | CANCELLED | empty = all three
    const orderType = searchParams.get("orderType")
    const source = searchParams.get("source")
    const dateFrom = searchParams.get("dateFrom")   // ISO date string
    const dateTo = searchParams.get("dateTo")       // ISO date string
    const search = searchParams.get("search")?.trim()
    const branchScope = session.user.branch_id ? { branch_id: session.user.branch_id } : {}

    // Build dynamic where clause
    const where: Prisma.OrderWhereInput = {
      restaurant_id: session.user.restaurant_id,
      ...branchScope,
      status: statusParam
        ? { equals: statusParam as any }
        : { in: ["DELIVERED", "REJECTED", "CANCELLED"] },
    }

    if (orderType && ["DINING", "TAKEAWAY", "HOME_DELIVERY"].includes(orderType)) {
      where.order_type = orderType as OrderType
    }
    if (source === "POS" || source === "WHATSAPP") where.source = source

    if (dateFrom || dateTo) {
      where.created_at = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo
          ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) }
          : {}),
      }
    }

    if (search) {
      where.OR = [
        { order_number: { contains: search, mode: "insensitive" } },
        { customer_name_snapshot: { contains: search, mode: "insensitive" } },
        { customer_phone_snapshot: { contains: search, mode: "insensitive" } },
      ]
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: true,
        history: {
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    })

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Fetch Order History Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
