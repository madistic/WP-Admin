import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/phone"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim() || ""
    const type = searchParams.get("type") || "all" // all, new, returning, inactive
    const ordersFilter = searchParams.get("orders") || "all" // 1, 2-5, 5+
    const spendingFilter = searchParams.get("spending") || "all" // low, medium, high
    const sortBy = searchParams.get("sortBy") || "newest" // newest, oldest, highest_spending, most_orders, recent_order
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const skip = (page - 1) * limit

    const restaurantId = session.user.restaurant_id

    // Fetch all customers for this restaurant with order aggregates
    let customers = await prisma.customer.findMany({
      where: {
        restaurant_id: restaurantId,
      },
      include: {
        orders: {
          select: {
            id: true,
            total: true,
            status: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    })

    // Compute metrics per customer
    let enriched = customers.map((c) => {
      const completedOrders = c.orders.filter((o) => o.status === "DELIVERED")
      const totalSpent = completedOrders.reduce((sum, o) => sum + o.total, 0)
      const totalOrdersCount = c.orders.length
      const completedOrdersCount = completedOrders.length

      // Segment type calculation
      let segment = "New"
      if (completedOrdersCount >= 2) segment = "Returning"
      if (completedOrdersCount === 0 && c.orders.length === 0) segment = "New"

      const daysSinceLastOrder = c.last_order_at
        ? (Date.now() - new Date(c.last_order_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999

      if (daysSinceLastOrder > 30) segment = "Inactive"

      return {
        ...c,
        totalSpent,
        totalOrdersCount,
        completedOrdersCount,
        segment,
        aov: completedOrdersCount > 0 ? totalSpent / completedOrdersCount : 0,
      }
    })

    // Apply Search Filter (Name, Phone normalized, Email, ID)
    if (search) {
      const searchNormalizedPhone = normalizePhoneNumber(search)
      const cleanSearch = search.toLowerCase()

      enriched = enriched.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(cleanSearch)
        const emailMatch = c.email?.toLowerCase().includes(cleanSearch)
        const idMatch = c.id.toLowerCase().includes(cleanSearch)
        const phoneMatch =
          c.phone.includes(cleanSearch) ||
          normalizePhoneNumber(c.phone).includes(searchNormalizedPhone)
        return nameMatch || emailMatch || idMatch || phoneMatch
      })
    }

    // Apply Customer Type Filter
    if (type !== "all") {
      if (type === "new") enriched = enriched.filter((c) => c.completedOrdersCount <= 1)
      if (type === "returning") enriched = enriched.filter((c) => c.completedOrdersCount >= 2)
      if (type === "inactive") enriched = enriched.filter((c) => c.segment === "Inactive")
    }

    // Apply Order Count Filter
    if (ordersFilter === "1") enriched = enriched.filter((c) => c.completedOrdersCount === 1)
    if (ordersFilter === "2-5") enriched = enriched.filter((c) => c.completedOrdersCount >= 2 && c.completedOrdersCount <= 5)
    if (ordersFilter === "5+") enriched = enriched.filter((c) => c.completedOrdersCount > 5)

    // Apply Spending Filter
    if (spendingFilter === "low") enriched = enriched.filter((c) => c.totalSpent < 1000)
    if (spendingFilter === "medium") enriched = enriched.filter((c) => c.totalSpent >= 1000 && c.totalSpent <= 5000)
    if (spendingFilter === "high") enriched = enriched.filter((c) => c.totalSpent > 5000)

    // Calculate Dynamic KPI Statistics
    const allRestaurantCustomers = await prisma.customer.findMany({
      where: { restaurant_id: restaurantId },
      include: {
        orders: {
          where: { status: "DELIVERED" },
          select: { total: true },
        },
      },
    })

    const totalCustomers = allRestaurantCustomers.length
    let returningCustomers = 0
    let newCustomers = 0
    let totalCustomerRevenue = 0

    allRestaurantCustomers.forEach((c) => {
      const revenue = c.orders.reduce((sum, o) => sum + o.total, 0)
      totalCustomerRevenue += revenue
      if (c.orders.length >= 2) returningCustomers++
      else newCustomers++
    })

    // Apply Sorting
    enriched.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === "highest_spending") return b.totalSpent - a.totalSpent
      if (sortBy === "most_orders") return b.completedOrdersCount - a.completedOrdersCount
      if (sortBy === "recent_order") {
        const timeA = a.last_order_at ? new Date(a.last_order_at).getTime() : 0
        const timeB = b.last_order_at ? new Date(b.last_order_at).getTime() : 0
        return timeB - timeA
      }
      return 0
    })

    // Server-side Pagination
    const totalCount = enriched.length
    const paginatedCustomers = enriched.slice(skip, skip + limit)

    return NextResponse.json({
      customers: paginatedCustomers,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      stats: {
        totalCustomers,
        newCustomers,
        returningCustomers,
        totalCustomerRevenue,
      },
    })
  } catch (error: any) {
    console.error("Fetch Customers Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, phone, email, notes, default_address } = body

    if (!name || !phone) {
      return NextResponse.json({ error: "Name and Phone number are required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id
    const normalizedPhone = normalizePhoneNumber(phone)

    // Rule 1 & Rule 24: Deduplication check per restaurant
    const existing = await prisma.customer.findFirst({
      where: {
        restaurant_id: restaurantId,
        phone: normalizedPhone,
      },
    })

    if (existing) {
      return NextResponse.json(
        {
          error: "Customer already exists with this phone number",
          customer: existing,
          isDuplicate: true,
        },
        { status: 409 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurantId,
        name,
        phone: normalizedPhone,
        email,
        notes,
        addresses: default_address
          ? {
              create: {
                address_line: default_address,
                is_default: true,
                address_type: "Home",
              },
            }
          : undefined,
        activities: {
          create: {
            type: "CUSTOMER_CREATED",
            description: "Customer profile created manually by staff",
          },
        },
      },
      include: {
        addresses: true,
      },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error: any) {
    console.error("Create Customer Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
