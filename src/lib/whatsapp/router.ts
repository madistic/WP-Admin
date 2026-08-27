import {
  getWhatsAppCategories,
  getWhatsAppItems,
  getWhatsAppItemDetails,
  formatWhatsAppProductDetailText,
} from "./adapter"
import { sendWhatsAppTextMessage } from "./client"
import {
  addToCart,
  getCartDetails,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  formatCartText,
  updateCartItemInstruction,
  updateCartCheckoutStep,
  validateCartForCheckout,
  createOrderFromCart,
} from "./cart"

export interface IncomingWhatsAppMessageData {
  id: string
  from: string
  type: string
  textBody?: string
  interactiveId?: string
  interactiveTitle?: string
}

export interface ResolvedRestaurantInfo {
  id: string
  name: string
  whatsapp_phone_number_id?: string | null
}

/**
 * Main Entry Point for handling incoming WhatsApp events for a resolved restaurant tenant.
 */
export async function processIncomingWhatsAppMessage(
  restaurant: ResolvedRestaurantInfo,
  message: IncomingWhatsAppMessageData
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const sender = message.from
  const rawText = (message.textBody || "").trim()
  const interactiveId = message.interactiveId || ""
  const cleanText = rawText.toLowerCase()

  // Fetch current cart state to check active checkout steps
  const cart = await getCartDetails(restaurant.id, sender)

  // 1. Checkout State Machine Handling
  if (cart && cart.checkout_step === "AWAITING_ADDRESS") {
    if (cleanText === "cancel") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      const responseText = "❌ Checkout cancelled. Your cart items are preserved. Reply 'cart' to view items or 'menu' to browse."
      if (restaurant.whatsapp_phone_number_id) {
        await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
      }
      return { handled: true, responseText, intent: "checkout_cancelled" }
    }

    // Treat raw text input as delivery address & optional name
    const address = rawText
    let name = "WhatsApp Customer"

    if (address.includes(",")) {
      const parts = address.split(",")
      if (parts[0].trim().length < 25) {
        name = parts[0].trim()
      }
    }

    await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
      customerName: name,
      deliveryAddress: address,
    })

    return await renderOrderConfirmation(restaurant, sender)
  }

  if (cart && cart.checkout_step === "AWAITING_CONFIRMATION") {
    if (cleanText === "confirm" || cleanText === "yes" || cleanText === "place order") {
      return await handleFinalOrderCreation(restaurant, sender)
    }

    if (cleanText === "cancel" || cleanText === "no") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      const responseText = "❌ Checkout cancelled. Your cart items are preserved. Reply 'cart' to view items or 'menu' to browse."
      if (restaurant.whatsapp_phone_number_id) {
        await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
      }
      return { handled: true, responseText, intent: "checkout_cancelled" }
    }
  }

  // 2. Interactive Button / List Reply Handlers
  if (interactiveId.startsWith("cat_")) {
    const categoryId = interactiveId.replace("cat_", "")
    return await handleCategorySelection(restaurant, sender, categoryId)
  }

  if (interactiveId.startsWith("item_")) {
    const itemId = interactiveId.replace("item_", "")
    return await handleItemSelection(restaurant, sender, itemId)
  }

  if (interactiveId.startsWith("add_")) {
    const itemId = interactiveId.replace("add_", "")
    return await handleAddToCartAction(restaurant, sender, itemId)
  }

  if (interactiveId.startsWith("cart_inc_")) {
    const cartItemId = interactiveId.replace("cart_inc_", "")
    return await handleCartQuantityChange(restaurant, sender, cartItemId, 1)
  }

  if (interactiveId.startsWith("cart_dec_")) {
    const cartItemId = interactiveId.replace("cart_dec_", "")
    return await handleCartQuantityChange(restaurant, sender, cartItemId, -1)
  }

  if (interactiveId.startsWith("cart_rem_")) {
    const cartItemId = interactiveId.replace("cart_rem_", "")
    return await handleCartItemRemoval(restaurant, sender, cartItemId)
  }

  // 3. Checkout Intent ("checkout", "place order", "buy")
  const checkoutKeywords = ["checkout", "place order", "buy", "pay"]
  if (checkoutKeywords.includes(cleanText)) {
    return await handleInitiateCheckout(restaurant, sender)
  }

  // 4. View Cart Intent ("cart", "view cart", "my cart", "basket")
  const cartKeywords = ["cart", "view cart", "my cart", "basket"]
  if (cartKeywords.includes(cleanText)) {
    return await handleViewCart(restaurant, sender)
  }

  // 5. Special Instruction Command ("note 1 extra spicy", "note 1 no onion")
  if (cleanText.startsWith("note ")) {
    return await handleItemNoteCommand(restaurant, sender, rawText)
  }

  // 6. Clear Cart Intent ("clear", "clear cart", "empty cart")
  const clearKeywords = ["clear", "clear cart", "empty cart"]
  if (clearKeywords.includes(cleanText)) {
    await clearCart(restaurant.id, sender)
    const responseText = "🧹 Your cart has been cleared!\n\nReply 'menu' to view available items."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "clear_cart" }
  }

  // 7. Quantity modification via text ("+1 1", "-1 1", "remove 1")
  if (cleanText.startsWith("+1 ") || cleanText.startsWith("-1 ") || cleanText.startsWith("remove ")) {
    return await handleTextQuantityCommand(restaurant, sender, cleanText)
  }

  // 8. Add to Cart via text ("add 1", "add biryani")
  if (cleanText.startsWith("add ")) {
    const target = cleanText.replace("add ", "").trim()
    return await handleAddToCartTextCommand(restaurant, sender, target)
  }

  // 9. Greeting / Main Menu Intent ("hi", "hello", "menu", "start", "hey")
  const greetingKeywords = ["hi", "hello", "menu", "start", "hey", "categories", "home", "main"]
  if (greetingKeywords.includes(cleanText) || cleanText === "") {
    return await handleMainMenu(restaurant, sender)
  }

  // 10. Match Category by Number or Name
  const categories = await getWhatsAppCategories(restaurant.id)
  if (/^\d+$/.test(cleanText)) {
    const numIndex = parseInt(cleanText, 10)
    if (numIndex >= 1 && numIndex <= categories.length) {
      const selectedCat = categories[numIndex - 1]
      return await handleCategorySelection(restaurant, sender, selectedCat.id)
    }
  }

  const matchedCategory = categories.find(
    (c) => c.title.toLowerCase() === cleanText || cleanText.includes(c.title.toLowerCase())
  )
  if (matchedCategory) {
    return await handleCategorySelection(restaurant, sender, matchedCategory.id)
  }

  // 11. Search Products by Name / Keyword
  const searchResults = await getWhatsAppItems(restaurant.id, { searchQuery: rawText })
  if (searchResults.length === 1) {
    return await handleItemSelection(restaurant, sender, searchResults[0].id)
  } else if (searchResults.length > 1) {
    const lines: string[] = []
    lines.push(`🔍 *Search Results for "${rawText}":*\n`)
    searchResults.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.name} - ${item.price_display}`)
    })
    lines.push(`\nReply with item name or number to view details!`)
    lines.push(`Or reply *"add [item #]"* to add directly to cart.`)
    const responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }

    return { handled: true, responseText, intent: "search_results" }
  }

  // 12. Fallback: Show Main Menu
  return await handleMainMenu(restaurant, sender)
}

/**
 * Renders and sends Main Category Menu for a restaurant.
 */
export async function handleMainMenu(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const categories = await getWhatsAppCategories(restaurant.id)

  const lines: string[] = []
  lines.push(`👋 Welcome to *${restaurant.name}*! 🍽️\n`)

  if (categories.length === 0) {
    lines.push("Our menu is currently being updated. Please check back soon!")
  } else {
    lines.push("Explore our delicious menu categories:\n")
    categories.forEach((cat, idx) => {
      lines.push(`${idx + 1}. *${cat.title}* (${cat.item_count} items)`)
    })
    lines.push(`\nReply with category number or name to view items!`)
    lines.push(`Or type product name to search (e.g. *"biryani"*).`)
  }

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "main_menu" }
}

/**
 * Renders and sends Category Items view for a restaurant.
 */
export async function handleCategorySelection(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  categoryId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const [categories, items] = await Promise.all([
    getWhatsAppCategories(restaurant.id),
    getWhatsAppItems(restaurant.id, { categoryId }),
  ])

  const category = categories.find((c) => c.id === categoryId)
  const catName = category ? category.title : "Category"

  const lines: string[] = []
  lines.push(`📂 *${catName}* Menu:\n`)

  if (items.length === 0) {
    lines.push("No active items available in this category right now.")
  } else {
    items.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.name} - ${item.price_display}`)
    })
    lines.push(`\nReply with item name or number to view details!`)
    lines.push(`Or reply *"add [item #]"* to add directly to cart.`)
  }

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "category_items" }
}

/**
 * Renders and sends Item Details view with Add to Cart instructions.
 */
export async function handleItemSelection(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  itemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const item = await getWhatsAppItemDetails(restaurant.id, itemId)

  if (!item) {
    const fallbackText = "Sorry, that item is currently unavailable. Reply 'menu' to view available items."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, fallbackText)
    }
    return { handled: true, responseText: fallbackText, intent: "item_not_found" }
  }

  const baseDetails = formatWhatsAppProductDetailText(item)
  const lines: string[] = [baseDetails]

  lines.push(`\n---------------------------------`)
  lines.push(`🛒 Reply *"add"* or *"add to cart"* to add this item!`)

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "item_details" }
}

/**
 * Handles Add to Cart action for a specific menuItemId.
 */
export async function handleAddToCartAction(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  menuItemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const result = await addToCart(restaurant.id, sender, menuItemId)

  let responseText = ""
  if (!result.success) {
    responseText = `⚠️ ${result.error || "Failed to add item to cart."}`
  } else {
    const cart = result.cart
    const addedItem = cart?.items.find((i) => i.menu_item_id === menuItemId)
    const itemName = addedItem ? addedItem.name : "Item"

    const lines: string[] = []
    lines.push(`✅ Added *${itemName}* (x1) to your cart! 🛒\n`)
    lines.push(`Cart Total: *₹${cart?.total.toFixed(2)}* (${cart?.item_count} items)`)
    lines.push(`\nReply *"cart"* to view cart & modify quantities.`)
    lines.push(`Reply *"checkout"* to place your order!`)
    responseText = lines.join("\n")
  }

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "add_to_cart" }
}

/**
 * Handles text-based Add to Cart commands ("add 1", "add biryani", "add <id>").
 */
export async function handleAddToCartTextCommand(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  target: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const items = await getWhatsAppItems(restaurant.id)
  let selectedItemId: string | undefined = undefined

  const exactItem = items.find((i) => i.id === target)
  if (exactItem) {
    selectedItemId = exactItem.id
  }

  if (!selectedItemId && /^\d+$/.test(target)) {
    const numIndex = parseInt(target, 10)
    if (numIndex >= 1 && numIndex <= items.length) {
      selectedItemId = items[numIndex - 1].id
    }
  }

  if (!selectedItemId) {
    const matched = items.find((i) => i.name.toLowerCase().includes(target.toLowerCase()))
    if (matched) {
      selectedItemId = matched.id
    }
  }

  if (!selectedItemId) {
    const responseText = `⚠️ Could not find item "${target}". Reply 'menu' to view available items.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "item_not_found" }
  }

  return await handleAddToCartAction(restaurant, sender, selectedItemId)
}

/**
 * Handles special instructions note command ("note 1 extra spicy").
 */
export async function handleItemNoteCommand(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  rawText: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    const responseText = "Your cart is currently empty! Reply 'menu' to view available items."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "cart_empty" }
  }

  const parts = rawText.trim().split(" ")
  if (parts.length < 3) {
    const responseText = `⚠️ Please specify item # and instruction, e.g.: *"note 1 less spicy"*`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "invalid_note_format" }
  }

  const itemIdx = parseInt(parts[1], 10)
  const instruction = parts.slice(2).join(" ")

  if (isNaN(itemIdx) || itemIdx < 1 || itemIdx > cart.items.length) {
    const responseText = `⚠️ Invalid item number "${parts[1]}". Please check your cart items:`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "invalid_cart_item_number" }
  }

  const targetCartItem = cart.items[itemIdx - 1]
  const updateRes = await updateCartItemInstruction(targetCartItem.id, instruction)

  const responseText = updateRes.cart
    ? formatCartText(updateRes.cart)
    : "Note updated! Reply 'checkout' to proceed."

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "add_item_note" }
}

/**
 * Handles View Cart request.
 */
export async function handleViewCart(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  const responseText = cart
    ? formatCartText(cart)
    : "Your cart is currently empty. Reply 'menu' to start adding items!"

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "view_cart" }
}

/**
 * Initiates Checkout process.
 */
export async function handleInitiateCheckout(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  providedAddress?: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  // 1. Validate Cart items for availability
  const validation = await validateCartForCheckout(restaurant.id, sender)
  if (!validation.valid) {
    const responseText = `⚠️ ${validation.error || "Cannot proceed with checkout."}`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "checkout_validation_failed" }
  }

  // 2. Check if address was provided directly or in stored cart
  const cart = await getCartDetails(restaurant.id, sender)

  const address = providedAddress || cart?.delivery_address

  if (!address) {
    await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_ADDRESS")

    const lines: string[] = []
    lines.push(`📍 *Delivery Address Required*\n`)
    lines.push(`Please reply with your name & full delivery address to complete your order:`)
    lines.push(`_(Example: John Doe, Flat 402, High Street, Bandra East)_`)
    lines.push(`\nReply *"cancel"* to abort checkout.`)

    const responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }

    return { handled: true, responseText, intent: "awaiting_address" }
  }

  // Address is available -> transition to AWAITING_CONFIRMATION
  await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
    customerName: cart?.customer_name || "WhatsApp Customer",
    deliveryAddress: address,
  })

  return await renderOrderConfirmation(restaurant, sender)
}

/**
 * Formats and renders Order Confirmation screen.
 */
export async function renderOrderConfirmation(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    const responseText = "Your cart is currently empty! Reply 'menu' to view available items."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "cart_empty" }
  }

  const lines: string[] = []
  lines.push(`📋 *Order Confirmation (Cash on Delivery)*\n`)
  lines.push(`*Deliver To:* ${cart.customer_name || "Customer"}`)
  lines.push(`*Address:* ${cart.delivery_address || "Provided Address"}\n`)

  lines.push(`*Items:*`)
  cart.items.forEach((item, idx) => {
    lines.push(`${idx + 1}. *${item.name}* (x${item.quantity}) - ₹${item.line_total.toFixed(2)}`)
    if (item.variant_name) lines.push(`   • Size: ${item.variant_name}`)
    if (item.addons_detail) lines.push(`   • Addons: ${item.addons_detail}`)
    if (item.special_instructions) lines.push(`   • Note: _"${item.special_instructions}"_`)
  })

  lines.push(`\n💵 *Subtotal:* ₹${cart.subtotal.toFixed(2)}`)
  if (cart.delivery_fee > 0) {
    lines.push(`🛵 *Delivery Fee:* ₹${cart.delivery_fee.toFixed(2)}`)
  }
  lines.push(`💰 *Total Amount:* ₹${cart.total.toFixed(2)} (Pay COD)`)

  lines.push(`\nReply *"confirm"* to place your order!`)
  lines.push(`Reply *"cancel"* to abort checkout.`)

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "order_confirmation_prompt" }
}

/**
 * Executes Order creation upon explicit confirmation ("confirm").
 */
export async function handleFinalOrderCreation(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  const customerName = cart?.customer_name || "WhatsApp Customer"
  const deliveryAddress = cart?.delivery_address || "WhatsApp Delivery Address"

  const result = await createOrderFromCart(restaurant.id, sender, {
    customerName,
    deliveryAddress,
  })

  let responseText = ""
  if (!result.success) {
    responseText = `❌ Order Creation Failed: ${result.error || "Please try again."}\nYour cart has been preserved.`
  } else {
    const lines: string[] = []
    lines.push(`✅ *Order placed successfully!*\n`)
    lines.push(`Order *#${result.orderNumber}*`)
    lines.push(`Total: *₹${result.total?.toFixed(2)}*`)
    lines.push(`Payment: *Cash on Delivery*`)
    lines.push(`Status: *New*`)
    lines.push(`\nThank you for ordering with *${restaurant.name}*! 🍽️`)
    responseText = lines.join("\n")
  }

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: result.success ? "order_created" : "order_creation_failed" }
}

/**
 * Handles Quantity Changes (+1 / -1) for cart items.
 */
export async function handleCartQuantityChange(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string,
  delta: number
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const result = await updateCartItemQuantity(cartItemId, delta, true)
  const responseText = result.cart
    ? formatCartText(result.cart)
    : "Cart updated! Reply 'menu' to view available items."

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "update_cart_quantity" }
}

/**
 * Handles Cart Item Removal.
 */
export async function handleCartItemRemoval(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const result = await removeCartItem(cartItemId)
  const responseText = result.cart
    ? formatCartText(result.cart)
    : "Item removed. Reply 'menu' to view available items."

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "remove_cart_item" }
}

/**
 * Handles text commands like "+1 1", "-1 1", "remove 1".
 */
export async function handleTextQuantityCommand(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cleanText: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    const responseText = "Your cart is currently empty! Reply 'menu' to view available items."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "cart_empty" }
  }

  let action: "inc" | "dec" | "remove" = "inc"
  let itemNumStr = ""

  if (cleanText.startsWith("+1 ")) {
    action = "inc"
    itemNumStr = cleanText.replace("+1 ", "").trim()
  } else if (cleanText.startsWith("-1 ")) {
    action = "dec"
    itemNumStr = cleanText.replace("-1 ", "").trim()
  } else if (cleanText.startsWith("remove ")) {
    action = "remove"
    itemNumStr = cleanText.replace("remove ", "").trim()
  }

  const itemIdx = parseInt(itemNumStr, 10)
  if (isNaN(itemIdx) || itemIdx < 1 || itemIdx > cart.items.length) {
    const responseText = `⚠️ Invalid item number "${itemNumStr}". Please check your cart items:`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "invalid_cart_item_number" }
  }

  const targetCartItem = cart.items[itemIdx - 1]

  if (action === "inc") {
    return await handleCartQuantityChange(restaurant, sender, targetCartItem.id, 1)
  } else if (action === "dec") {
    return await handleCartQuantityChange(restaurant, sender, targetCartItem.id, -1)
  } else {
    return await handleCartItemRemoval(restaurant, sender, targetCartItem.id)
  }
}
