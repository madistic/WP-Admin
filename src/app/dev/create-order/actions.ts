"use server"

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/phone"

type PosItem = { menu_item_id: string; quantity: number; variant_id?: string; addon_ids?: string[]; description?: string }

export async function createTestOrder(payload: { restaurant_id: string; order_type: OrderType; table_number?: string; customer_name?: string; customer_phone?: string; address?: string; items: PosItem[]; client_request_id: string }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.restaurant_id !== payload.restaurant_id) return { error: "Unauthorized" }
    if (!payload.client_request_id || !payload.items?.length) return { error: "Add at least one menu item." }
    if (payload.order_type === OrderType.DINING && !payload.table_number?.trim()) return { error: "Enter a table number for dining orders." }
    if (!payload.customer_name?.trim() || !payload.customer_phone?.trim()) return { error: "Customer name and phone number are required." }
    if (payload.order_type === OrderType.HOME_DELIVERY && !payload.address?.trim()) return { error: "Delivery address is required for home delivery." }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { restaurant_id_client_request_id: { restaurant_id: payload.restaurant_id, client_request_id: payload.client_request_id } } })
      if (existing) return existing
      const restaurant = await tx.restaurant.findUnique({ where: { id: payload.restaurant_id } })
      if (!restaurant) throw new Error("Restaurant not found")
      const phone = normalizePhoneNumber(payload.customer_phone!)
      const customer = await tx.customer.upsert({ where: { restaurant_id_phone: { restaurant_id: payload.restaurant_id, phone } }, update: payload.customer_name?.trim() ? { name: payload.customer_name.trim() } : {}, create: { restaurant_id: payload.restaurant_id, phone, name: payload.customer_name?.trim() || "Walk-in Customer" } })

      const orderItems = []
      let subtotal = 0
      for (const input of payload.items) {
        if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("Invalid item quantity")
        const item = await tx.menuItem.findFirst({ where: { id: input.menu_item_id, restaurant_id: payload.restaurant_id, is_active: true, is_available: true }, include: { variants: true, addons: true } })
        if (!item) throw new Error("A selected menu item is unavailable")
        const variant = input.variant_id ? item.variants.find((entry) => entry.id === input.variant_id && entry.is_available) : undefined
        if (input.variant_id && !variant) throw new Error(`Variant for ${item.name} is unavailable`)
        const addons = (input.addon_ids || []).map((id) => item.addons.find((entry) => entry.id === id && entry.is_available)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        const unitPrice = (variant?.price || item.price) + addons.reduce((total, addon) => total + addon.price, 0)
        const lineTotal = unitPrice * input.quantity
        subtotal += lineTotal
        const details = [input.description?.trim(), variant ? `Variant: ${variant.name}` : "", addons.length ? `Add-ons: ${addons.map((addon) => addon.name).join(", ")}` : ""].filter(Boolean).join(" | ")
        orderItems.push({ menu_item_id: item.id, item_name_snapshot: item.name, unit_price_snapshot: unitPrice, quantity: input.quantity, description: details || null, line_total: lineTotal })
      }

      const deliveryFee = payload.order_type === OrderType.HOME_DELIVERY ? restaurant.delivery_fee : 0
      const address = payload.order_type === OrderType.HOME_DELIVERY ? payload.address!.trim() : payload.order_type === OrderType.DINING ? `Dining Table ${payload.table_number!.trim()}` : "Takeaway"
      const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`
      return tx.order.create({ data: { order_number: orderNumber, restaurant_id: payload.restaurant_id, customer_id: customer.id, customer_name_snapshot: customer.name, customer_phone_snapshot: customer.phone, delivery_address_snapshot: address, order_type: payload.order_type, table_number: payload.order_type === OrderType.DINING ? payload.table_number!.trim() : null, client_request_id: payload.client_request_id, subtotal, delivery_fee: deliveryFee, total: subtotal + deliveryFee, payment_method: PaymentMethod.COD, payment_status: PaymentStatus.PENDING, status: OrderStatus.NEW, source: OrderSource.POS, items: { create: orderItems }, history: { create: { to_status: OrderStatus.NEW, reason: "POS order created" } } } })
    })

    revalidatePath("/orders")
    revalidatePath("/history")
    return { success: true, orderNumber: result.order_number }
  } catch (error) {
    console.error("Create POS Order Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to create order" }
  }
}
