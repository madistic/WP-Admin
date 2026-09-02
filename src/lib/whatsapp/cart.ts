import prisma from "@/lib/prisma"
import { OrderSource, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client"

export interface CartItemAddOptions {
  variantId?: string
  addonIds?: string[]
  quantity?: number
  specialInstructions?: string
}

export interface FormattedCartItem {
  id: string
  menu_item_id: string
  name: string
  unit_price: number
  quantity: number
  line_total: number
  variant_name?: string
  addons_detail?: string
  special_instructions?: string
  is_available: boolean
}

export interface FormattedCartSummary {
  id: string
  restaurant_id: string
  restaurant_name: string
  customer_whatsapp_number: string
  items: FormattedCartItem[]
  subtotal: number
  delivery_fee: number
  total: number
  item_count: number
  checkout_step: string
  customer_name?: string
  delivery_address?: string
}

/**
 * Gets or creates a WhatsApp Cart for a specific restaurant and customer phone number.
 */
export async function getOrCreateCart(restaurantId: string, customerWhatsappNumber: string) {
  if (!restaurantId || !customerWhatsappNumber) {
    throw new Error("restaurantId and customerWhatsappNumber are required for cart creation")
  }

  const cleanPhone = customerWhatsappNumber.startsWith("+") ? customerWhatsappNumber : `+${customerWhatsappNumber}`

  const cart = await prisma.whatsAppCart.findUnique({
    where: {
      restaurant_id_customer_whatsapp_number: {
        restaurant_id: restaurantId,
        customer_whatsapp_number: cleanPhone,
      },
    },
    include: {
      items: {
        include: {
          menuItem: true,
        },
        orderBy: { created_at: "asc" },
      },
    },
  })

  if (cart) return cart

  return await prisma.whatsAppCart.create({
    data: {
      restaurant_id: restaurantId,
      customer_whatsapp_number: cleanPhone,
      checkout_step: "IDLE",
    },
    include: {
      items: {
        include: {
          menuItem: true,
        },
        orderBy: { created_at: "asc" },
      },
    },
  })
}

/**
 * Retrieves a formatted cart summary with pricing and totals.
 */
export async function getCartDetails(
  restaurantId: string,
  customerWhatsappNumber: string
): Promise<FormattedCartSummary | null> {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, delivery_fee: true },
  })

  const formattedItems: FormattedCartItem[] = cart.items.map((item) => {
    const lineTotal = item.unit_price_snapshot * item.quantity
    let addonsDetail: string | undefined = undefined

    if (item.selected_addons) {
      try {
        const parsedAddons = JSON.parse(item.selected_addons)
        if (Array.isArray(parsedAddons) && parsedAddons.length > 0) {
          addonsDetail = parsedAddons.map((a: any) => a.name || a).join(", ")
        }
      } catch (e) {
        addonsDetail = item.selected_addons
      }
    }

    return {
      id: item.id,
      menu_item_id: item.menu_item_id,
      name: item.item_name_snapshot,
      unit_price: item.unit_price_snapshot,
      quantity: item.quantity,
      line_total: lineTotal,
      variant_name: item.variant_name_snapshot || undefined,
      addons_detail: addonsDetail,
      special_instructions: item.special_instructions || undefined,
      is_available: item.menuItem.is_available && item.menuItem.is_active,
    }
  })

  const subtotal = formattedItems.reduce((sum, item) => sum + item.line_total, 0)
  const deliveryFee = restaurant?.delivery_fee || 0
  const total = subtotal > 0 ? subtotal + deliveryFee : 0
  const itemCount = formattedItems.reduce((sum, item) => sum + item.quantity, 0)

  return {
    id: cart.id,
    restaurant_id: restaurantId,
    restaurant_name: restaurant?.name || "Restaurant",
    customer_whatsapp_number: customerWhatsappNumber,
    items: formattedItems,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    item_count: itemCount,
    checkout_step: cart.checkout_step || "IDLE",
    customer_name: cart.customer_name || undefined,
    delivery_address: cart.delivery_address || undefined,
  }
}

/**
 * Adds an item to the WhatsApp Cart after validating availability.
 */
export async function addToCart(
  restaurantId: string,
  customerWhatsappNumber: string,
  menuItemId: string,
  options?: CartItemAddOptions
): Promise<{ success: boolean; cart?: FormattedCartSummary; error?: string }> {
  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      restaurant_id: restaurantId,
      is_active: true,
      category: { is_active: true },
    },
    include: {
      variants: true,
      addons: true,
    },
  })

  if (!menuItem) {
    return { success: false, error: "Item not found or inactive for this restaurant." }
  }

  if (!menuItem.is_available) {
    return { success: false, error: `Sorry, "${menuItem.name}" is currently unavailable.` }
  }

  let unitPrice = menuItem.price
  let variantName: string | undefined = undefined

  if (options?.variantId) {
    const variant = menuItem.variants.find((v) => v.id === options.variantId)
    if (variant && variant.is_available) {
      unitPrice = variant.price
      variantName = variant.name
    }
  }

  const selectedAddonObjects: Array<{ id: string; name: string; price: number }> = []
  if (options?.addonIds && options.addonIds.length > 0) {
    options.addonIds.forEach((addonId) => {
      const addon = menuItem.addons.find((a) => a.id === addonId)
      if (addon && addon.is_available) {
        selectedAddonObjects.push({ id: addon.id, name: addon.name, price: addon.price })
        unitPrice += addon.price
      }
    })
  }

  const addQty = options?.quantity && options.quantity > 0 ? options.quantity : 1
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)

  const addonsJson = selectedAddonObjects.length > 0 ? JSON.stringify(selectedAddonObjects) : null

  const existingItem = await prisma.whatsAppCartItem.findFirst({
    where: {
      cart_id: cart.id,
      menu_item_id: menuItemId,
      variant_id: options?.variantId || null,
      selected_addons: addonsJson,
      special_instructions: options?.specialInstructions || null,
    },
  })

  if (existingItem) {
    await prisma.whatsAppCartItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: existingItem.quantity + addQty,
        unit_price_snapshot: unitPrice,
      },
    })
  } else {
    await prisma.whatsAppCartItem.create({
      data: {
        cart_id: cart.id,
        menu_item_id: menuItemId,
        variant_id: options?.variantId || null,
        selected_addons: addonsJson,
        quantity: addQty,
        unit_price_snapshot: unitPrice,
        item_name_snapshot: menuItem.name,
        variant_name_snapshot: variantName,
        special_instructions: options?.specialInstructions || null,
      },
    })
  }

  const updatedCart = await getCartDetails(restaurantId, customerWhatsappNumber)
  return { success: true, cart: updatedCart || undefined }
}

/**
 * Updates special instructions / note for a specific cart item.
 */
export async function updateCartItemInstruction(
  cartItemId: string,
  instruction: string | null
): Promise<{ success: boolean; cart?: FormattedCartSummary; error?: string }> {
  const item = await prisma.whatsAppCartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true },
  })

  if (!item) {
    return { success: false, error: "Cart item not found." }
  }

  await prisma.whatsAppCartItem.update({
    where: { id: cartItemId },
    data: {
      special_instructions: instruction && instruction.trim() !== "" ? instruction.trim() : null,
    },
  })

  const updatedCart = await getCartDetails(item.cart.restaurant_id, item.cart.customer_whatsapp_number)
  return { success: true, cart: updatedCart || undefined }
}

/**
 * Updates cart item quantity (+1, -1, or set specific value). If quantity <= 0, removes item.
 */
export async function updateCartItemQuantity(
  cartItemId: string,
  deltaOrQuantity: number,
  isDelta: boolean = true
): Promise<{ success: boolean; cart?: FormattedCartSummary }> {
  const item = await prisma.whatsAppCartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true },
  })

  if (!item) {
    return { success: false }
  }

  const newQty = isDelta ? item.quantity + deltaOrQuantity : deltaOrQuantity

  if (newQty <= 0) {
    await prisma.whatsAppCartItem.delete({
      where: { id: cartItemId },
    })
  } else {
    await prisma.whatsAppCartItem.update({
      where: { id: cartItemId },
      data: { quantity: newQty },
    })
  }

  const updatedCart = await getCartDetails(item.cart.restaurant_id, item.cart.customer_whatsapp_number)
  return { success: true, cart: updatedCart || undefined }
}

/**
 * Removes a specific item from the cart.
 */
export async function removeCartItem(cartItemId: string): Promise<{ success: boolean; cart?: FormattedCartSummary }> {
  const item = await prisma.whatsAppCartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true },
  })

  if (!item) {
    return { success: false }
  }

  await prisma.whatsAppCartItem.delete({
    where: { id: cartItemId },
  })

  const updatedCart = await getCartDetails(item.cart.restaurant_id, item.cart.customer_whatsapp_number)
  return { success: true, cart: updatedCart || undefined }
}

/**
 * Updates checkout state machine step and stored customer address / name.
 */
export async function updateCartCheckoutStep(
  restaurantId: string,
  customerWhatsappNumber: string,
  step: string | null,
  data?: { customerName?: string; deliveryAddress?: string }
) {
  const cleanPhone = customerWhatsappNumber.startsWith("+") ? customerWhatsappNumber : `+${customerWhatsappNumber}`
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)

  return await prisma.whatsAppCart.update({
    where: { id: cart.id },
    data: {
      checkout_step: step || "IDLE",
      customer_name: data?.customerName !== undefined ? data.customerName : cart.customer_name,
      delivery_address: data?.deliveryAddress !== undefined ? data.deliveryAddress : cart.delivery_address,
    },
  })
}

/**
 * Clears all items in a customer's cart for a restaurant and resets checkout step.
 */
export async function clearCart(restaurantId: string, customerWhatsappNumber: string): Promise<boolean> {
  const cleanPhone = customerWhatsappNumber.startsWith("+") ? customerWhatsappNumber : `+${customerWhatsappNumber}`

  const cart = await prisma.whatsAppCart.findUnique({
    where: {
      restaurant_id_customer_whatsapp_number: {
        restaurant_id: restaurantId,
        customer_whatsapp_number: cleanPhone,
      },
    },
  })

  if (!cart) return true

  await prisma.whatsAppCartItem.deleteMany({
    where: { cart_id: cart.id },
  })

  await prisma.categoryItemSelection.deleteMany({
    where: { cart_id: cart.id },
  })

  await prisma.whatsAppCart.update({
    where: { id: cart.id },
    data: {
      checkout_step: "IDLE",
      customer_name: null,
      delivery_address: null,
    },
  })

  return true
}

/**
 * Category Item Selection helpers (for stage 3 multi-item selection before adding to cart)
 */
export async function getCategorySelections(restaurantId: string, customerWhatsappNumber: string) {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)
  const selections = await prisma.categoryItemSelection.findMany({
    where: { cart_id: cart.id },
  })
  return { cartId: cart.id, selections }
}

export async function updateCategorySelectionQuantity(
  restaurantId: string,
  customerWhatsappNumber: string,
  menuItemId: string,
  delta: number,
  options?: { variantId?: string; addons?: string[] }
) {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)
  const existing = await prisma.categoryItemSelection.findUnique({
    where: {
      cart_id_menu_item_id: {
        cart_id: cart.id,
        menu_item_id: menuItemId,
      },
    },
  })

  const newQty = (existing?.quantity || 0) + delta

  if (newQty <= 0) {
    if (existing) {
      await prisma.categoryItemSelection.delete({
        where: { id: existing.id },
      })
    }
  } else {
    const addonsJson = options?.addons ? JSON.stringify(options.addons) : existing?.addons || null
    const variantId = options?.variantId !== undefined ? options.variantId : existing?.variant_id || null

    if (existing) {
      await prisma.categoryItemSelection.update({
        where: { id: existing.id },
        data: {
          quantity: newQty,
          variant_id: variantId,
          addons: addonsJson,
        },
      })
    } else {
      await prisma.categoryItemSelection.create({
        data: {
          cart_id: cart.id,
          menu_item_id: menuItemId,
          quantity: newQty,
          variant_id: variantId,
          addons: addonsJson,
        },
      })
    }
  }

  return await getCategorySelections(restaurantId, customerWhatsappNumber)
}

export async function clearCategorySelections(restaurantId: string, customerWhatsappNumber: string) {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)
  await prisma.categoryItemSelection.deleteMany({
    where: { cart_id: cart.id },
  })
}

export async function commitSelectionsToCart(restaurantId: string, customerWhatsappNumber: string) {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)
  const selections = await prisma.categoryItemSelection.findMany({
    where: { cart_id: cart.id },
  })

  for (const sel of selections) {
    let parsedAddons: string[] | undefined = undefined
    if (sel.addons) {
      try {
        const arr = JSON.parse(sel.addons)
        if (Array.isArray(arr)) parsedAddons = arr.map((a: any) => typeof a === "string" ? a : a.id || a.name)
      } catch (e) {}
    }

    await addToCart(restaurantId, customerWhatsappNumber, sel.menu_item_id, {
      quantity: sel.quantity,
      variantId: sel.variant_id || undefined,
      addonIds: parsedAddons,
    })
  }

  // Clear selections after commit
  await prisma.categoryItemSelection.deleteMany({
    where: { cart_id: cart.id },
  })

  return await getCartDetails(restaurantId, customerWhatsappNumber)
}

/**
 * Validates cart items against current database state before checkout.
 */
export async function validateCartForCheckout(
  restaurantId: string,
  customerWhatsappNumber: string
): Promise<{ valid: boolean; error?: string }> {
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)

  if (cart.items.length === 0) {
    return { valid: false, error: "Your cart is empty." }
  }

  for (const item of cart.items) {
    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: item.menu_item_id,
        restaurant_id: restaurantId,
        is_active: true,
        category: { is_active: true },
      },
      include: {
        variants: true,
        addons: true,
      },
    })

    if (!menuItem) {
      return {
        valid: false,
        error: `Sorry, "${item.item_name_snapshot}" is no longer available in the menu.`,
      }
    }

    if (!menuItem.is_available) {
      return {
        valid: false,
        error: `Sorry, "${menuItem.name}" is currently out of stock / unavailable.`,
      }
    }

    if (item.variant_id) {
      const variant = menuItem.variants.find((v) => v.id === item.variant_id)
      if (!variant || !variant.is_available) {
        return {
          valid: false,
          error: `Sorry, selected option for "${menuItem.name}" is no longer available.`,
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Generates a unique order number (e.g. ORD-8X2K9P).
 */
function generateOrderNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `ORD-${code}`
}

/**
 * Creates an Order in DB with server-side price recalculation and clears cart on success.
 */
export async function createOrderFromCart(
  restaurantId: string,
  customerWhatsappNumber: string,
  checkoutData: { customerName: string; deliveryAddress: string }
): Promise<{ success: boolean; orderNumber?: string; total?: number; error?: string }> {
  // 1. Re-validate cart state
  const validation = await validateCartForCheckout(restaurantId, customerWhatsappNumber)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const cleanPhone = customerWhatsappNumber.startsWith("+") ? customerWhatsappNumber : `+${customerWhatsappNumber}`
  const cart = await getOrCreateCart(restaurantId, customerWhatsappNumber)

  // 2. Fetch Restaurant for Delivery Fee & Verification
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, delivery_fee: true },
  })

  if (!restaurant) {
    return { success: false, error: "Restaurant tenant not found." }
  }

  // 3. Server-side Price Recalculation directly from current PostgreSQL menu state
  let recalculatedSubtotal = 0
  const orderItemsData: Array<{
    menu_item_id: string
    item_name_snapshot: string
    unit_price_snapshot: number
    quantity: number
    description: string | null
    line_total: number
  }> = []

  for (const cartItem of cart.items) {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: cartItem.menu_item_id },
      include: { variants: true, addons: true },
    })

    if (!menuItem) {
      return { success: false, error: `Item ${cartItem.item_name_snapshot} not found.` }
    }

    let unitPrice = menuItem.price
    let descParts: string[] = []

    if (cartItem.variant_id) {
      const variant = menuItem.variants.find((v) => v.id === cartItem.variant_id)
      if (variant) {
        unitPrice = variant.price
        descParts.push(`Variant: ${variant.name}`)
      }
    }

    if (cartItem.selected_addons) {
      try {
        const parsedAddons = JSON.parse(cartItem.selected_addons)
        if (Array.isArray(parsedAddons)) {
          const addonNames: string[] = []
          parsedAddons.forEach((pa) => {
            const addon = menuItem.addons.find((a) => a.id === pa.id || a.name === pa.name)
            if (addon) {
              unitPrice += addon.price
              addonNames.push(addon.name)
            }
          })
          if (addonNames.length > 0) {
            descParts.push(`Addons: ${addonNames.join(", ")}`)
          }
        }
      } catch (e) {
        // ignore parse error
      }
    }

    if (cartItem.special_instructions) {
      descParts.push(`Note: ${cartItem.special_instructions}`)
    }

    const lineTotal = unitPrice * cartItem.quantity
    recalculatedSubtotal += lineTotal

    orderItemsData.push({
      menu_item_id: menuItem.id,
      item_name_snapshot: menuItem.name,
      unit_price_snapshot: unitPrice,
      quantity: cartItem.quantity,
      description: descParts.length > 0 ? descParts.join(" | ") : null,
      line_total: lineTotal,
    })
  }

  const deliveryFee = restaurant.delivery_fee || 0
  const finalTotal = recalculatedSubtotal + deliveryFee

  // 4. Reuse or Create Customer record for (restaurant_id, phone)
  let customer = await prisma.customer.findUnique({
    where: {
      restaurant_id_phone: {
        restaurant_id: restaurantId,
        phone: cleanPhone,
      },
    },
  })

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurantId,
        phone: cleanPhone,
        name: checkoutData.customerName || "WhatsApp Customer",
        whatsapp_number: cleanPhone,
      },
    })
  } else if (checkoutData.customerName && customer.name !== checkoutData.customerName) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { name: checkoutData.customerName },
    })
  }

  // 5. Generate Unique Order Number
  let orderNumber = generateOrderNumber()
  let isUnique = false
  while (!isUnique) {
    const existing = await prisma.order.findUnique({ where: { order_number: orderNumber } })
    if (!existing) isUnique = true
    else orderNumber = generateOrderNumber()
  }

  // 6. Transactional Order Creation
  try {
    const newOrder = await prisma.order.create({
      data: {
        order_number: orderNumber,
        restaurant_id: restaurantId,
        customer_id: customer.id,
        customer_name_snapshot: checkoutData.customerName || customer.name,
        customer_phone_snapshot: cleanPhone,
        delivery_address_snapshot: checkoutData.deliveryAddress,
        subtotal: recalculatedSubtotal,
        delivery_fee: deliveryFee,
        total: finalTotal,
        payment_method: PaymentMethod.COD,
        payment_status: PaymentStatus.PENDING,
        status: OrderStatus.NEW,
        source: OrderSource.WHATSAPP,
        items: {
          create: orderItemsData,
        },
      },
    })

    // 7. Clear cart items on successful order creation ONLY
    await clearCart(restaurantId, customerWhatsappNumber)

    return {
      success: true,
      orderNumber: newOrder.order_number,
      total: newOrder.total,
    }
  } catch (error: any) {
    console.error("[Create Order Error]:", error)
    // DO NOT clear cart on failure!
    return {
      success: false,
      error: "Order creation failed. Please try again.",
    }
  }
}

/**
 * Formats WhatsApp text output for Cart summary view.
 */
export function formatCartText(cart: FormattedCartSummary): string {
  const lines: string[] = []
  lines.push(`🛒 *Your Cart at ${cart.restaurant_name}:*\n`)

  if (cart.items.length === 0) {
    lines.push("Your cart is currently empty! 🍽️")
    lines.push("\nReply 'menu' to start adding delicious items.")
    return lines.join("\n")
  }

  cart.items.forEach((item, idx) => {
    const itemHeader = `${idx + 1}. *${item.name}* (x${item.quantity}) - ₹${item.line_total.toFixed(2)}`
    lines.push(itemHeader)
    if (item.variant_name) {
      lines.push(`   • Size: ${item.variant_name}`)
    }
    if (item.addons_detail) {
      lines.push(`   • Addons: ${item.addons_detail}`)
    }
    if (item.special_instructions) {
      lines.push(`   • Note: _"${item.special_instructions}"_`)
    }
    if (!item.is_available) {
      lines.push(`   ⚠️ _Item currently unavailable_`)
    }
  })

  lines.push(`\n💵 *Subtotal:* ₹${cart.subtotal.toFixed(2)}`)
  if (cart.delivery_fee > 0) {
    lines.push(`🛵 *Delivery Fee:* ₹${cart.delivery_fee.toFixed(2)}`)
  }
  lines.push(`💰 *Total:* ₹${cart.total.toFixed(2)}`)

  lines.push(`\n*Commands:*`)
  lines.push(`• Reply *"checkout"* to place your order`)
  lines.push(`• Reply *"note [item #] [instruction]"* to add notes (e.g. *"note 1 extra spicy"*)`)
  lines.push(`• Reply *"+1 [item #]"* or *"-1 [item #]"* to adjust quantity`)
  lines.push(`• Reply *"remove [item #]"* to delete an item`)
  lines.push(`• Reply *"clear"* to empty cart`)

  return lines.join("\n")
}
