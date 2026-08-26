import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const createOrderSchema = z.object({
  restaurant_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  items: z.array(
    z.object({
      menu_item_id: z.string().uuid(),
      quantity: z.number().int().positive(),
      description: z.string().optional().nullable(),
    })
  ).min(1),
})

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    
    const whereClause: any = {
      restaurant_id: session.user.restaurant_id,
    }
    
    if (status) {
      whereClause.status = status
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        items: true,
        history: {
          orderBy: { created_at: "asc" },
        },
        customer: {
          include: {
            addresses: true,
            _count: {
              select: { orders: true },
            },
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 200,
    })

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Fetch Orders Error:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = createOrderSchema.parse(body)
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify restaurant and get delivery fee
      const restaurant = await tx.restaurant.findUnique({
        where: { id: parsed.restaurant_id },
      })
      if (!restaurant) throw new Error("Restaurant not found")
      if (!restaurant.is_open) throw new Error("Restaurant is currently closed")

      // 2. Fetch customer
      const customer = await tx.customer.findUnique({
        where: { id: parsed.customer_id },
        include: { addresses: true },
      })
      if (!customer) throw new Error("Customer not found")
      
      const address = customer.addresses[0]
      if (!address) throw new Error("Customer has no address")
      const formattedAddress = `${address.address_line}${address.area ? `, ${address.area}` : ''}${address.city ? `, ${address.city}` : ''}${address.pincode ? ` - ${address.pincode}` : ''}`

      // 3. Deduplicate / combine identical items with SAME instructions
      const combinedItemsMap = new Map<string, { menu_item_id: string; quantity: number; description?: string | null }>()

      for (const item of parsed.items) {
        const cleanDesc = item.description?.trim() || ""
        const key = `${item.menu_item_id}:::${cleanDesc}`
        if (combinedItemsMap.has(key)) {
          const existing = combinedItemsMap.get(key)!
          existing.quantity += item.quantity
        } else {
          combinedItemsMap.set(key, {
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            description: cleanDesc || null,
          })
        }
      }

      const combinedItems = Array.from(combinedItemsMap.values())

      // 4. Fetch menu items and calculate totals (Never trust client prices)
      let subtotal = 0
      const orderItemsData = []
      
      for (const item of combinedItems) {
        const menuItem = await tx.menuItem.findUnique({
          where: { id: item.menu_item_id },
        })
        
        if (!menuItem) throw new Error(`Menu item not found: ${item.menu_item_id}`)
        if (menuItem.restaurant_id !== restaurant.id) throw new Error(`Menu item does not belong to this restaurant`)
        if (!menuItem.is_available) throw new Error(`Menu item is currently unavailable: ${menuItem.name}`)

        const lineTotal = menuItem.price * item.quantity
        subtotal += lineTotal

        orderItemsData.push({
          menu_item_id: menuItem.id,
          item_name_snapshot: menuItem.name,
          unit_price_snapshot: menuItem.price,
          quantity: item.quantity,
          description: item.description || null,
          line_total: lineTotal,
        })
      }
      
      if (subtotal < restaurant.minimum_order) {
        throw new Error(`Minimum order amount is ₹${restaurant.minimum_order}`)
      }

      const total = subtotal + restaurant.delivery_fee
      
      const count = await tx.order.count({ where: { restaurant_id: restaurant.id } })
      const orderNumber = `ORD-${1000 + count + 1}`

      // 5. Create the order
      const order = await tx.order.create({
        data: {
          order_number: orderNumber,
          restaurant_id: restaurant.id,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          customer_phone_snapshot: customer.phone,
          delivery_address_snapshot: formattedAddress,
          subtotal,
          delivery_fee: restaurant.delivery_fee,
          total,
          payment_method: "COD",
          status: "NEW",
          source: "DEV_CRUD",
          items: {
            create: orderItemsData,
          },
          history: {
            create: {
              to_status: "NEW",
              reason: "Order created",
            },
          },
        },
        include: {
          items: true,
        },
      })

      return order
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("Create Order Error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 400 }
    )
  }
}
