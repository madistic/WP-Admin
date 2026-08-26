import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurantId = session.user.restaurant_id

    // Rule 24: Scoped by restaurant_id & customer_id
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        restaurant_id: restaurantId,
      },
      include: {
        addresses: {
          orderBy: { is_default: "desc" },
        },
        orders: {
          include: {
            items: true,
            history: {
              orderBy: { created_at: "asc" },
            },
          },
          orderBy: { created_at: "desc" },
        },
        staffNotes: {
          orderBy: { created_at: "desc" },
        },
        activities: {
          orderBy: { created_at: "desc" },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Dynamic metrics calculation
    const completedOrders = customer.orders.filter((o) => o.status === "DELIVERED")
    const ltv = completedOrders.reduce((sum, o) => sum + o.total, 0)
    const totalOrdersCount = customer.orders.length
    const completedOrdersCount = completedOrders.length
    const aov = completedOrdersCount > 0 ? ltv / completedOrdersCount : 0

    // Determine favorite category from order items
    const categoryCountMap: Record<string, number> = {}
    for (const order of completedOrders) {
      for (const item of order.items) {
        // Fetch menu item category snapshot if available
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: item.menu_item_id },
          include: { category: true },
        })
        if (menuItem?.category?.name) {
          categoryCountMap[menuItem.category.name] = (categoryCountMap[menuItem.category.name] || 0) + item.quantity
        }
      }
    }

    let favoriteCategory = "N/A"
    let maxCount = 0
    Object.entries(categoryCountMap).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count
        favoriteCategory = cat
      }
    })

    // Dynamic Segmentation
    let segment = "New"
    if (completedOrdersCount >= 2) segment = "Returning"
    if (ltv >= 5000) segment = "VIP"

    const daysSinceLastOrder = customer.last_order_at
      ? (Date.now() - new Date(customer.last_order_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999

    if (daysSinceLastOrder > 30 && completedOrdersCount > 0) segment = "Inactive"

    return NextResponse.json({
      ...customer,
      metrics: {
        totalOrdersCount,
        completedOrdersCount,
        ltv,
        aov,
        favoriteCategory,
        segment,
        firstOrderDate: customer.orders.length > 0 ? customer.orders[customer.orders.length - 1].created_at : null,
        lastOrderDate: customer.last_order_at,
      },
    })
  } catch (error: any) {
    console.error("Fetch Customer 360 Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const restaurantId = session.user.restaurant_id

    const existing = await prisma.customer.findFirst({
      where: { id: customerId, restaurant_id: restaurantId },
    })

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.date_of_birth !== undefined && { date_of_birth: body.date_of_birth ? new Date(body.date_of_birth) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    })

    await prisma.customerActivity.create({
      data: {
        customer_id: customerId,
        type: "PROFILE_UPDATED",
        description: `Customer profile updated by ${session.user.name || "staff"}`,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Update Customer Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
