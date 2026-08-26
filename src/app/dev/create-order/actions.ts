"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/phone"

export type OrderItemPayload = {
  menu_item_id: string
  quantity: number
  description?: string
}

export async function createTestOrder(payload: {
  restaurant_id: string
  customer_name: string
  customer_phone: string
  address: string
  items: OrderItemPayload[]
}) {
  try {
    const { restaurant_id, customer_name, customer_phone, address: addressLine, items } = payload

    if (!restaurant_id || !customer_name || !customer_phone || !addressLine || !items || items.length === 0) {
      return { error: "Please provide all required fields and add at least one menu item." }
    }

    // Validate quantities
    for (const item of items) {
      if (!item.menu_item_id || !item.quantity || item.quantity < 1) {
        return { error: "Invalid item or quantity selected." }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurant_id },
      })

      if (!restaurant) throw new Error("Restaurant not found")
      if (!restaurant.is_open) throw new Error("Restaurant is currently closed")

      // Phone normalization and deduplication per restaurant
      const normalizedPhone = normalizePhoneNumber(customer_phone)

      let customer = await tx.customer.findFirst({
        where: {
          restaurant_id,
          phone: normalizedPhone,
        },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            restaurant_id,
            name: customer_name,
            phone: normalizedPhone,
            last_order_at: new Date(),
          },
        })
      } else {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: customer_name,
            last_order_at: new Date(),
          },
        })
      }

      // Create Customer Address
      const address = await tx.customerAddress.create({
        data: {
          customer_id: customer.id,
          address_line: addressLine,
          city: restaurant.city,
        },
      })

      // Combine duplicate menu items with SAME instructions
      const combinedItemsMap = new Map<string, { menu_item_id: string; quantity: number; description?: string }>()
      for (const it of items) {
        const cleanDesc = it.description?.trim() || ""
        const key = `${it.menu_item_id}:::${cleanDesc}`
        if (combinedItemsMap.has(key)) {
          combinedItemsMap.get(key)!.quantity += it.quantity
        } else {
          combinedItemsMap.set(key, {
            menu_item_id: it.menu_item_id,
            quantity: it.quantity,
            description: cleanDesc || undefined,
          })
        }
      }

      const orderItemsData = []
      let subtotal = 0

      for (const item of Array.from(combinedItemsMap.values())) {
        const menuItem = await tx.menuItem.findUnique({
          where: { id: item.menu_item_id },
        })

        if (!menuItem || !menuItem.is_available) {
          throw new Error(`Menu item "${menuItem?.name || item.menu_item_id}" is currently unavailable`)
        }

        const unitPrice = menuItem.price
        const lineTotal = unitPrice * item.quantity
        subtotal += lineTotal

        orderItemsData.push({
          menu_item_id: menuItem.id,
          item_name_snapshot: menuItem.name,
          unit_price_snapshot: unitPrice,
          quantity: item.quantity,
          description: item.description || null,
          line_total: lineTotal,
        })
      }

      const total = subtotal + restaurant.delivery_fee

      const count = await tx.order.count({ where: { restaurant_id: restaurant.id } })
      const orderNumber = `ORD-${1000 + count + 1}`

      const order = await tx.order.create({
        data: {
          order_number: orderNumber,
          restaurant_id: restaurant.id,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          customer_phone_snapshot: customer.phone,
          delivery_address_snapshot: address.address_line,
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
              reason: "Test order created via dev tool",
            },
          },
        },
      })

      await tx.customerActivity.create({
        data: {
          customer_id: customer.id,
          type: "ORDER_PLACED",
          description: `Placed order #${order.order_number} (₹${total.toFixed(2)})`,
          metadata: JSON.stringify({ order_id: order.id, total }),
        },
      })

      return order
    })

    revalidatePath("/orders")
    revalidatePath("/api/orders")
    revalidatePath("/customers")

    return { success: true, orderNumber: result.order_number }
  } catch (error: any) {
    console.error("Create Test Order Error:", error)
    return { error: error.message || "Failed to create order" }
  }
}
