import {
  getWhatsAppCategories,
  getWhatsAppItems,
  getWhatsAppItemDetails,
  formatWhatsAppProductDetailText,
} from "./adapter"
import {
  sendWhatsAppTextMessage,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  sendWhatsAppCatalogMessage,
  sendWhatsAppMultiProductList,
} from "./client"
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
  getCategorySelections,
  toggleCategorySelection,
  updateCategorySelectionQuantity,
  commitSelectionsToCart,
  clearCategorySelections,
} from "./cart"
import prisma from "@/lib/prisma"

export interface IncomingWhatsAppMessageData {
  id: string
  from: string
  type: string
  textBody?: string
  interactiveId?: string
  interactiveTitle?: string
  location?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  orderPayload?: {
    catalogId?: string
    text?: string
    productItems: Array<{
      product_retailer_id: string
      quantity: number
      item_price?: number
      currency?: string
    }>
  }
}

export interface ResolvedRestaurantInfo {
  id: string
  name: string
  whatsapp_phone_number_id?: string | null
  whatsapp_catalog_id?: string | null
  is_open?: boolean
  logo_url?: string | null
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

  // Handle native Meta WhatsApp Order Payload message type
  if (message.type === "order" && message.orderPayload) {
    return await handleNativeOrderMessage(restaurant, sender, message.orderPayload)
  }

  // ── RESTAURANT CLOSED CHECK ──────────────────────────────────────────────
  // Only block the initial greeting / new conversations when closed.
  // Existing checkout flows (address, confirmation) are allowed to complete.
  const cleanText = (message.textBody || "").trim().toLowerCase()
  const interactiveId = message.interactiveId || ""
  const isGreeting =
    cleanText === "hi" || cleanText === "hello" || cleanText === "hey" ||
    cleanText === "start" || interactiveId === "action_initial_greeting"

  if (isGreeting && restaurant.is_open === false) {
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(
        restaurant.whatsapp_phone_number_id,
        sender,
        `🔴 *We're currently closed.*\nPlease try again when we're open. 🍽️`
      )
    }
    return { handled: true, responseText: "closed", intent: "restaurant_closed" }
  }

  // Fetch current cart state to check active steps
  const cart = await getCartDetails(restaurant.id, sender)

  // 1. TRACK ORDER STATE HANDLING
  if (cart && cart.checkout_step === "AWAITING_TRACKING_ORDER_ID") {
    if (interactiveId === "action_main_menu" || cleanText === "menu" || cleanText === "hi" || cleanText === "cancel") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      return await handleInitialGreeting(restaurant, sender)
    }

    if (rawText.length > 0) {
      return await handleOrderTrackingQuery(restaurant, sender, rawText)
    }
  }

  // 2. CHECKOUT STATE MACHINE HANDLING
  if (
    cart &&
    (cart.checkout_step === "AWAITING_NAME" ||
      cart.checkout_step === "AWAITING_NAME_CHANGE" ||
      cart.checkout_step === "AWAITING_ADDRESS" ||
      cart.checkout_step === "AWAITING_LOCATION_CHOICE" ||
      cart.checkout_step === "AWAITING_MANUAL_ADDRESS" ||
      cart.checkout_step === "AWAITING_BUILDING_NO" ||
      cart.checkout_step === "AWAITING_CONFIRMATION" ||
      cart.checkout_step === "AWAITING_ADDRESS_SAVE_DECISION")
  ) {
    if (interactiveId === "co_cancel" || cleanText === "cancel") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      await clearCart(restaurant.id, sender)
      const responseText = "❌ Order cancelled. Your cart has been cleared."
      if (restaurant.whatsapp_phone_number_id) {
        await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
      }
      return await handleInitialGreeting(restaurant, sender)
    }

    if (interactiveId === "co_change_name" || cleanText === "change name") {
      await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_NAME_CHANGE")
      const responseText = "👤 Please reply with your new *Full Name*:"
      if (restaurant.whatsapp_phone_number_id) {
        await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
      }
      return { handled: true, responseText, intent: "awaiting_name_change" }
    }

    if (interactiveId === "co_empty_cart") {
      await clearCart(restaurant.id, sender)
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      return await handleInitialGreeting(restaurant, sender)
    }
    if (cart.checkout_step === "AWAITING_NAME_CHANGE") {
      if (rawText.length > 0) {
        const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
        await prisma.customer.updateMany({
          where: { restaurant_id: restaurant.id, phone: cleanPhone },
          data: { name: rawText }
        })
        
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_LOCATION_CHOICE", {
          customerName: rawText,
        })

        // Continue to address selection
        return await promptForAddressSelection(restaurant, sender, cleanPhone, rawText)
      }
    }

    if (interactiveId === "co_edit_cart" || cleanText === "edit cart") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      return await handleInitialGreeting(restaurant, sender)
    }

    if (cart.checkout_step === "AWAITING_NAME") {
      const customerName = rawText.length > 0 ? rawText : "Customer"
      await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_LOCATION_CHOICE", {
        customerName,
      })
      const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
      return await promptForAddressSelection(restaurant, sender, cleanPhone, customerName)
    }

    if (cart.checkout_step === "AWAITING_LOCATION_CHOICE") {
      if (interactiveId === "loc_share_current" || cleanText.includes("share") || cleanText.includes("location")) {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_BUILDING_NO")
        const responseText = "📍 Please share your current location attachment via WhatsApp."
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_location_message" }
      }

      if (interactiveId === "loc_enter_manual" || cleanText.includes("manual") || cleanText.includes("enter")) {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_MANUAL_ADDRESS")
        const responseText = "✍️ Please type your complete delivery address in ONE message:\n_(e.g. Flat 402, Sunshine Apartments, Bandra East, Mumbai)_"
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_manual_address" }
      }
    }

    if (cart.checkout_step === "AWAITING_BUILDING_NO") {
      if (message.type === "location" && message.location) {
        const loc = message.location
        const locAddress = loc.address || loc.name || `Lat: ${loc.latitude.toFixed(4)}, Long: ${loc.longitude.toFixed(4)}`
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_BUILDING_NO", {
          deliveryAddress: locAddress,
        })
        const responseText = `📍 Received location!\nNow, please reply with your *Building / Room / Flat number*:`
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_building_number" }
      }

      if (rawText.length > 0) {
        const fullAddress = cart.delivery_address ? `${rawText}, ${cart.delivery_address}` : rawText
        return await processNewAddressDecision(restaurant, sender, fullAddress)
      }
    }

    if (cart.checkout_step === "AWAITING_MANUAL_ADDRESS" || cart.checkout_step === "AWAITING_ADDRESS") {
      if (rawText.length > 0) {
        return await processNewAddressDecision(restaurant, sender, rawText)
      }
    }

    if (cart.checkout_step === "AWAITING_CONFIRMATION") {
      if (interactiveId === "co_confirm" || cleanText === "confirm" || cleanText === "yes" || cleanText === "place order") {
        return await handleFinalOrderCreation(restaurant, sender)
      }

      if (interactiveId === "co_change_address" || cleanText === "change address") {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_LOCATION_CHOICE")
        const responseText = "📍 How would you like to update your delivery address?"
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppInteractiveButtons(
            restaurant.whatsapp_phone_number_id,
            sender,
            responseText,
            [
              { id: "loc_share_current", title: "📍 Share Location" },
              { id: "loc_enter_manual", title: "✍️ Enter Manually" },
              { id: "co_cancel", title: "❌ Cancel" },
            ]
          )
        }
        return { handled: true, responseText, intent: "awaiting_location_choice" }
      }
    }
    
    // Address saving state
    if (cart.checkout_step === "AWAITING_ADDRESS_SAVE_DECISION") {
      if (interactiveId === "addr_save_yes" || cleanText === "save" || cleanText === "yes") {
        const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
        // Create or find customer to save address
        let customer = await prisma.customer.findFirst({ where: { restaurant_id: restaurant.id, phone: cleanPhone } })
        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              restaurant_id: restaurant.id,
              phone: cleanPhone,
              name: cart.customer_name || "WhatsApp Customer",
              whatsapp_number: cleanPhone,
            }
          })
        }
        if (customer && cart.delivery_address) {
          await prisma.customerAddress.create({
            data: {
              customer_id: customer.id,
              address_line: cart.delivery_address,
              label: "Saved Address",
            }
          })
        }
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION")
        return await renderOrderConfirmation(restaurant, sender)
      }
      if (interactiveId === "addr_save_no" || cleanText === "no") {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION")
        return await renderOrderConfirmation(restaurant, sender)
      }
    }
  }

  // 3. INTERACTIVE BUTTON / LIST REPLY HANDLERS
  if (interactiveId === "action_initial_greeting" || cleanText === "hi" || cleanText === "hello" || cleanText === "start" || cleanText === "hey") {
    return await handleInitialGreeting(restaurant, sender)
  }

  if (interactiveId === "action_track_order_prompt" || cleanText === "track order" || cleanText === "track") {
    return await handleTrackOrderPrompt(restaurant, sender)
  }

  if (interactiveId === "action_view_menu" || interactiveId === "action_categories") {
    return await handleOpenCatalog(restaurant, sender)
  }

  if (interactiveId === "loc_prompt_address") {
    const cart = await getCartDetails(restaurant.id, sender)
    if (cart) {
      const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
      return await promptForAddressSelection(restaurant, sender, cleanPhone, cart.customer_name || "Customer")
    }
  }

  // Address selection from previous addresses
  if (interactiveId.startsWith("addr_select_")) {
    const addressId = interactiveId.replace("addr_select_", "")
    const selectedAddress = await prisma.customerAddress.findUnique({ where: { id: addressId } })
    if (selectedAddress) {
      await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
        deliveryAddress: selectedAddress.address_line,
      })
      return await renderOrderConfirmation(restaurant, sender)
    }
  }

  if (interactiveId.startsWith("cat_")) {
    const categoryId = interactiveId.replace("cat_", "")
    return await handleCategoryProductsSelection(restaurant, sender, categoryId)
  }

  // Checkbox multi-selection toggle
  if (interactiveId.startsWith("sel_toggle_")) {
    const parts = interactiveId.replace("sel_toggle_", "").split("_")
    const categoryId = parts[0]
    const itemId = parts[1]
    await toggleCategorySelection(restaurant.id, sender, itemId)
    return await handleCategoryProductsSelection(restaurant, sender, categoryId)
  }

  if (interactiveId.startsWith("continue_cat_")) {
    const categoryId = interactiveId.replace("continue_cat_", "")
    return await handleCategoryQuantityStep(restaurant, sender, categoryId, 0)
  }

  if (interactiveId.startsWith("qstep_inc_")) {
    const parts = interactiveId.replace("qstep_inc_", "").split("_")
    const categoryId = parts[0]
    const itemIndex = parseInt(parts[1], 10)
    const itemId = parts[2]
    await updateCategorySelectionQuantity(restaurant.id, sender, itemId, 1)
    return await handleCategoryQuantityStep(restaurant, sender, categoryId, itemIndex)
  }

  if (interactiveId.startsWith("qstep_dec_")) {
    const parts = interactiveId.replace("qstep_dec_", "").split("_")
    const categoryId = parts[0]
    const itemIndex = parseInt(parts[1], 10)
    const itemId = parts[2]
    await updateCategorySelectionQuantity(restaurant.id, sender, itemId, -1)
    return await handleCategoryQuantityStep(restaurant, sender, categoryId, itemIndex)
  }

  if (interactiveId.startsWith("qstep_next_")) {
    const parts = interactiveId.replace("qstep_next_", "").split("_")
    const categoryId = parts[0]
    const nextIndex = parseInt(parts[1], 10)
    return await handleCategoryQuantityStep(restaurant, sender, categoryId, nextIndex)
  }

  if (interactiveId.startsWith("qstep_back_")) {
    const parts = interactiveId.replace("qstep_back_", "").split("_")
    const categoryId = parts[0]
    const prevIndex = parseInt(parts[1], 10)
    return await handleCategoryQuantityStep(restaurant, sender, categoryId, prevIndex)
  }

  if (interactiveId.startsWith("commit_cat_")) {
    return await handleCommitCategorySelections(restaurant, sender)
  }

  if (interactiveId.startsWith("item_")) {
    const itemId = interactiveId.replace("item_", "")
    return await handleItemSelection(restaurant, sender, itemId)
  }

  if (interactiveId.startsWith("add_") && !interactiveId.startsWith("add_var_") && !interactiveId.startsWith("add_addon_")) {
    const itemId = interactiveId.replace("add_", "")
    return await handleAddToCartAction(restaurant, sender, itemId)
  }

  if (interactiveId.startsWith("var_opt_")) {
    const [itemId, variantId] = interactiveId.replace("var_opt_", "").split("_")
    return await handleAddToCartAction(restaurant, sender, itemId, { variantId })
  }

  if (interactiveId.startsWith("add_note_prompt_")) {
    const cartItemId = interactiveId.replace("add_note_prompt_", "")
    return await handleAddNotePrompt(restaurant, sender, cartItemId)
  }

  if (interactiveId.startsWith("skip_note_")) {
    return await handleViewCart(restaurant, sender)
  }

  if (interactiveId.startsWith("cart_inc_")) {
    const cartItemId = interactiveId.replace("cart_inc_", "")
    await updateCartItemQuantity(restaurant.id, sender, cartItemId, 1)
    return await handleViewCart(restaurant, sender)
  }

  if (interactiveId.startsWith("cart_dec_")) {
    const cartItemId = interactiveId.replace("cart_dec_", "")
    await updateCartItemQuantity(restaurant.id, sender, cartItemId, -1)
    return await handleViewCart(restaurant, sender)
  }

  if (interactiveId.startsWith("cart_rem_")) {
    const cartItemId = interactiveId.replace("cart_rem_", "")
    await removeCartItem(restaurant.id, sender, cartItemId)
    return await handleViewCart(restaurant, sender)
  }

  if (interactiveId === "cart_checkout" || interactiveId === "action_checkout" || cleanText === "checkout") {
    return await handleInitiateCheckout(restaurant, sender)
  }

  if (interactiveId === "cart_clear" || cleanText === "clear" || cleanText === "clear cart") {
    await clearCart(restaurant.id, sender)
    return await handleInitialGreeting(restaurant, sender)
  }

  // Check if user is replying with a special instruction note text
  if (cart && (cart.checkout_step as string).startsWith("AWAITING_NOTE_ITEM_")) {
    const cartItemId = (cart.checkout_step as string).replace("AWAITING_NOTE_ITEM_", "")
    await updateCartItemInstruction(restaurant.id, sender, cartItemId, rawText)
    await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
    const responseText = `📝 Note added: _"${rawText}"_`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: "action_view_cart", title: "🛒 View Cart" },
          { id: "action_checkout", title: "✅ Checkout" },
        ]
      )
    }
    return { handled: true, responseText, intent: "note_saved" }
  }

  // Check if user is replying to Search Prompt
  if (cart && cart.checkout_step === "AWAITING_SEARCH_QUERY") {
    await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
    return await handleSearchResults(restaurant, sender, rawText)
  }

  // Text commands fallback (+1 1, -1 1, remove 1, note 1 xxx, add xxx)
  if (cleanText.startsWith("note ")) {
    return await handleItemNoteCommand(restaurant, sender, rawText)
  }

  if (cleanText.startsWith("+1 ") || cleanText.startsWith("-1 ") || cleanText.startsWith("remove ")) {
    return await handleTextQuantityCommand(restaurant, sender, cleanText)
  }

  if (cleanText.startsWith("add ")) {
    const target = cleanText.replace("add ", "").trim()
    return await handleAddToCartTextCommand(restaurant, sender, target)
  }

  // Match category by number or name fallback
  const categories = await getWhatsAppCategories(restaurant.id)
  if (/^\d+$/.test(cleanText)) {
    const numIndex = parseInt(cleanText, 10)
    if (numIndex >= 1 && numIndex <= categories.length) {
      const selectedCat = categories[numIndex - 1]
      return await handleCategoryProductsSelection(restaurant, sender, selectedCat.id)
    }
  }

  const matchedCategory = categories.find(
    (c) => c.title.toLowerCase() === cleanText || cleanText.includes(c.title.toLowerCase())
  )
  if (matchedCategory) {
    return await handleCategoryProductsSelection(restaurant, sender, matchedCategory.id)
  }

  // Search Products by Name / Keyword
  const searchResults = await getWhatsAppItems(restaurant.id, { searchQuery: rawText })
  if (searchResults.length > 0) {
    return await handleSearchResults(restaurant, sender, rawText)
  }

  // Default to Initial Greeting
  return await handleInitialGreeting(restaurant, sender)
}

/**
 * STEP 1: INITIAL GREETING ("Hi")
 * Shows exactly: 🍽️ View Menu & 📦 Track Order
 */
export async function handleInitialGreeting(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartCheckoutStep(restaurant.id, sender, "IDLE")

  const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
  const customer = await prisma.customer.findUnique({
    where: { restaurant_id_phone: { restaurant_id: restaurant.id, phone: cleanPhone } },
    select: { name: true }
  })

  const greetingName = customer?.name || "there"
  const responseText = `Hello ${greetingName} 👋\nWelcome to ${restaurant.name}! What would you like to order today?`

  if (!restaurant.whatsapp_phone_number_id) {
    return { handled: true, responseText, intent: "initial_greeting" }
  }

  const { sendWhatsAppTextMessage } = await import("./client")
  await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)

  // Immediately flow into the native catalog
  return await handleOpenCatalog(restaurant, sender)
}

export async function handleOpenCatalog(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
  const responseText = `Here is our menu:`
  const catalogId = restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID

  if (!restaurant.whatsapp_phone_number_id) {
    return { handled: true, responseText, intent: "open_catalog" }
  }

  if (catalogId) {
    const { checkProductExistsInMeta, syncRestaurantCatalog } = await import("./catalog")
    let items = await getWhatsAppItems(restaurant.id)

    const dbSyncedItems = items.filter(
      (i) => i.meta_sync_status === "SYNCED" && i.meta_product_sku && i.meta_product_sku.trim() !== ""
    )

    let verifiedRetailerId: string | null = null

    for (const candidate of dbSyncedItems) {
      const liveCheck = await checkProductExistsInMeta(catalogId, candidate.meta_product_sku!, candidate.name)
      if (liveCheck.exists) {
        verifiedRetailerId = candidate.meta_product_sku!
        break
      }
    }

    if (!verifiedRetailerId) {
      const hasAttemptedSync = items.some((i) => i.meta_sync_status !== null)

      if (!hasAttemptedSync && items.length > 0) {
        await syncRestaurantCatalog(restaurant.id)
        items = await getWhatsAppItems(restaurant.id)

        const refreshedItems = items.filter(
          (i) => i.meta_sync_status === "SYNCED" && i.meta_product_sku && i.meta_product_sku.trim() !== ""
        )
        for (const candidate of refreshedItems) {
          const liveCheck = await checkProductExistsInMeta(catalogId, candidate.meta_product_sku!, candidate.name)
          if (liveCheck.exists) {
            verifiedRetailerId = candidate.meta_product_sku!
            break
          }
        }
      }
    }

    if (verifiedRetailerId) {
      const { getMenuCategories } = await import("./menu")
      const categories = await getMenuCategories(restaurant.id)
      
      const sections: Array<{ title: string; product_items: Array<{ product_retailer_id: string }> }> = []
      let totalAdded = 0
      
      for (const cat of categories) {
        if (sections.length >= 10 || totalAdded >= 30) break;
        
        const catItems = dbSyncedItems.filter(i => i.category_id === cat.id)
        if (catItems.length === 0) continue;

        const productItems = []
        for (const item of catItems) {
          if (totalAdded >= 30) break;
          productItems.push({ product_retailer_id: item.meta_product_sku! })
          totalAdded++
        }

        if (productItems.length > 0) {
          sections.push({
            title: cat.name.slice(0, 24),
            product_items: productItems
          })
        }
      }
      
      const { sendWhatsAppMultiProductList, sendWhatsAppInteractiveButtons } = await import("./client")
      await sendWhatsAppMultiProductList(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        catalogId,
        sections
      )

      // Always show Track Order alongside the menu
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        "Need to check an existing order?",
        [{ id: "action_track_order_prompt", title: "📦 Track Order" }]
      )

      return { handled: true, responseText, intent: "open_catalog" }
    }

    const errorText = `⚠️ Our menu is currently being set up. Please try again in a few moments or contact us directly.`
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, errorText)
    return { handled: true, responseText: errorText, intent: "open_catalog_error" }
  }

  return await handleInitialGreeting(restaurant, sender)
}

export async function handleOpenCatalogCart(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
  const catalogId = restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
  const responseText = "You can update your cart items below:"

  if (restaurant.whatsapp_phone_number_id && catalogId) {
    const { sendWhatsAppCatalogMessage } = await import("./client")
    await sendWhatsAppCatalogMessage(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      catalogId
    )
    return { handled: true, responseText, intent: "open_catalog_cart" }
  }
  return await handleInitialGreeting(restaurant, sender)
}

/**
 * STEP 9: TRACK ORDER PROMPT & QUERY
 */
export async function handleTrackOrderPrompt(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
  
  // Try to find active orders
  const activeOrders = await prisma.order.findMany({
    where: {
      restaurant_id: restaurant.id,
      customer_phone_snapshot: cleanPhone,
      status: { in: ["NEW", "IN_PROCESS", "OUT_FOR_DELIVERY"] }
    },
    orderBy: { created_at: "desc" },
    include: { items: true }
  })

  if (activeOrders.length === 1) {
    // If exactly one, just use the direct order tracking query logic
    return await handleOrderTrackingQuery(restaurant, sender, activeOrders[0].order_number)
  }

  if (activeOrders.length > 1) {
    const lines = ["📦 *Your Active Orders*\n"]
    activeOrders.forEach(o => {
      lines.push(`• *${o.order_number}* - ${o.status.replace(/_/g, " ")}\n  Total: ₹${o.total.toFixed(2)}`)
    })
    const responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_initial_greeting", title: "🍽️ View Menu" }]
      )
    }
    return { handled: true, responseText, intent: "track_multiple_orders" }
  }

  // 0 active orders
  const responseText = "You have no active orders right now."
  if (restaurant.whatsapp_phone_number_id) {
    // Send them the native catalog instead so they can order
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }
  return await handleInitialGreeting(restaurant, sender)
}

export async function handleOrderTrackingQuery(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  orderIdInput: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
  const cleanOrderId = orderIdInput.trim().toUpperCase()

  const order = await prisma.order.findFirst({
    where: {
      order_number: cleanOrderId,
      restaurant_id: restaurant.id,
      customer_phone_snapshot: cleanPhone,
    },
    include: { items: true },
  })

  if (!order) {
    const responseText = `❌ *Order Not Found*\n\nCould not find Order ID *"${orderIdInput}"* for your phone number at ${restaurant.name}.\n\nPlease check the ID and try again, or return to main menu.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: "action_track_order_prompt", title: "📦 Retry Order ID" },
          { id: "action_initial_greeting", title: "🔙 Back to Main Menu" },
        ]
      )
    }
    return { handled: true, responseText, intent: "track_order_not_found" }
  }

  await updateCartCheckoutStep(restaurant.id, sender, "IDLE")

  const statusLabels: Record<string, string> = {
    NEW: "🟡 Received (New)",
    IN_PROCESS: "👨‍🍳 Preparing in Kitchen",
    OUT_FOR_DELIVERY: "🛵 Out for Delivery",
    DELIVERED: "✅ Delivered",
    REJECTED: "❌ Rejected",
    CANCELLED: "❌ Cancelled",
  }

  const statusDisplay = statusLabels[order.status] || order.status

  const lines: string[] = []
  lines.push(`📦 *Order Status for #${order.order_number}*\n`)
  lines.push(`Status: *${statusDisplay}*`)
  lines.push(`Total Amount: *₹${order.total.toFixed(2)}* (${order.items.length} items)`)
  lines.push(`Payment: *${order.payment_method} (${order.payment_status})*`)
  lines.push(`Placed On: ${order.created_at.toLocaleString("en-IN")}`)

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "action_initial_greeting", title: "🔙 Main Menu" },
        { id: "action_view_cart", title: "🛒 View Cart" },
      ]
    )
  }

  return { handled: true, responseText, intent: "track_order_success" }
}

/**
 * STEP 2 & 5: CATEGORIES LIST
 */
export async function handleCategoriesList(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const categories = await getWhatsAppCategories(restaurant.id)
  const cart = await getCartDetails(restaurant.id, sender)

  const bodyText = `📂 *Menu Categories*\nSelect a category below to view items:`

  if (categories.length === 0) {
    const fallbackText = `👋 Welcome to *${restaurant.name}*!\n\nOur menu is currently being updated. Please check back soon!`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, fallbackText)
    }
    return { handled: true, responseText: fallbackText, intent: "main_menu_empty" }
  }

  if (restaurant.whatsapp_phone_number_id) {
    if (categories.length <= 10) {
      const rows = categories.map((cat) => ({
        id: `cat_${cat.id}`,
        title: cat.title.slice(0, 24),
        description: `${cat.item_count} items`.slice(0, 72),
      }))

      // Always include View Cart row if cart has items
      if (cart && cart.item_count > 0 && rows.length < 10) {
        rows.push({
          id: "action_view_cart",
          title: "🛒 View Cart",
          description: `${cart.item_count} items • Total: ₹${cart.total.toFixed(2)}`,
        })
      }

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        bodyText,
        "Select Category",
        [{ title: "Categories", rows }]
      )
    } else {
      const lines: string[] = [`📂 *Menu Categories* (${restaurant.name}):\n`]
      categories.forEach((cat, idx) => {
        lines.push(`${idx + 1}. *${cat.title}* (${cat.item_count} items)`)
      })
      lines.push(`\nReply with category number or name to view items!`)
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, lines.join("\n"))
    }
  }

  return { handled: true, responseText: bodyText, intent: "categories_list" }
}

/**
 * Handles incoming native WhatsApp Meta Catalog order payload (`messageType === "order"`).
 * Parses product items, populates/validates items in cart, recalculates prices server-side,
 * and proceeds directly to delivery address / checkout confirmation flow.
 */
export async function handleNativeOrderMessage(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  orderPayload: NonNullable<IncomingWhatsAppMessageData["orderPayload"]>
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const catalogId = restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID

  // Tenant Catalog Validation
  if (orderPayload.catalogId && catalogId && orderPayload.catalogId !== catalogId) {
    const errorMsg = `⚠️ Catalog validation failed. The submitted catalog (${orderPayload.catalogId}) does not match this restaurant.`
    console.warn(`[Native Order Error] Catalog mismatch for ${restaurant.name}: ${orderPayload.catalogId} vs ${catalogId}`)
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, errorMsg)
    }
    return { handled: true, responseText: errorMsg, intent: "native_order_failed" }
  }

  // Pre-validate all items before mutating/clearing existing cart
  const items = await getWhatsAppItems(restaurant.id)
  const validItemsToInsert: Array<{ menuItemId: string; quantity: number }> = []

  for (const itemPayload of orderPayload.productItems) {
    const sku = itemPayload.product_retailer_id
    const qty = Number(itemPayload.quantity)

    if (!sku || !Number.isInteger(qty) || qty <= 0) {
      console.warn(`[Native Order Error] Invalid item payload or quantity:`, itemPayload)
      continue
    }

    // Find matching item belonging to THIS restaurant by id or meta_product_sku
    const matchedItem = items.find((i) => i.id === sku || i.meta_product_sku === sku)

    if (!matchedItem) {
      console.warn(`[Native Order Error] Retailer ID '${sku}' does not belong to restaurant '${restaurant.id}'`)
      continue
    }

    validItemsToInsert.push({ menuItemId: matchedItem.id, quantity: qty })
  }

  if (validItemsToInsert.length === 0) {
    const failText = "⚠️ We couldn't process the selected items from the menu. Please try selecting active items from our menu."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, failText)
    }
    return { handled: true, responseText: failText, intent: "native_order_failed" }
  }

  // ALL items validated successfully -> NOW safe to replace cart
  await clearCart(restaurant.id, sender)

  for (const validItem of validItemsToInsert) {
    await addToCart(restaurant.id, sender, validItem.menuItemId, { quantity: validItem.quantity })
  }

  // Set cart step so next action goes into checkout
  await updateCartCheckoutStep(restaurant.id, sender, "IDLE")

  const cleanPhoneO = sender.startsWith("+") ? sender : `+${sender}`
  const existingCustomer = await prisma.customer.findUnique({
    where: { restaurant_id_phone: { restaurant_id: restaurant.id, phone: cleanPhoneO } },
    select: { name: true }
  })

  const greetingName = existingCustomer?.name || "there"
  const responseText = `Hello *${greetingName}* 👋\nReady to checkout?`

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "action_checkout", title: "✅ Continue" },
        { id: "co_cancel", title: "❌ Cancel Order" },
      ]
    )
  }

  return { handled: true, responseText, intent: "native_order_received_options" }
}

/**
 * STEP 3: CATEGORY PRODUCT MULTI-SELECTION (+ / - controls)
 */
export async function handleCategoryProductsSelection(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  categoryId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const categories = await getWhatsAppCategories(restaurant.id)
  const items = await getWhatsAppItems(restaurant.id, { categoryId })
  const { selections } = await getCategorySelections(restaurant.id, sender)

  const category = categories.find((c) => c.id === categoryId)
  const catName = category ? category.title : "Category"

  if (items.length === 0) {
    const text = `No items currently available in *${catName}*.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        text,
        [{ id: "action_categories", title: "🍽️ Order Food" }]
      )
    }
    return { handled: true, responseText: text, intent: "category_empty" }
  }

  const lines: string[] = [`Select Items (*${catName.toUpperCase()}*)\n`]

  items.forEach((item) => {
    const isSelected = selections.some((s) => s.menu_item_id === item.id)
    const checkIcon = isSelected ? "☑" : "☐"
    const vegBadge = item.is_veg ? "🟢" : "🔴"
    const cleanName = item.name.replace(/^[🟢🔴]\s*/, "")

    lines.push(`${checkIcon} *${cleanName}* ${vegBadge}`)
    lines.push(`   ${item.price_display}`)
    if (item.description) {
      lines.push(`   _${item.description.slice(0, 80)}${item.description.length > 80 ? "..." : ""}_`)
    }
    lines.push("")
  })

  const selectedCount = selections.length
  if (selectedCount > 0) {
    lines.push(`Selected: *${selectedCount} item${selectedCount > 1 ? "s" : ""}*`)
  }

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    if (items.length <= 8) {
      const rows: Array<{ id: string; title: string; description?: string }> = []
      items.forEach((item) => {
        const isSelected = selections.some((s) => s.menu_item_id === item.id)
        const checkIcon = isSelected ? "☑" : "☐"
        const cleanName = item.name.replace(/^[🟢🔴]\s*/, "")

        rows.push({
          id: `sel_toggle_${categoryId}_${item.id}`,
          title: `${checkIcon} ${cleanName}`.slice(0, 24),
          description: `${item.price_display}${isSelected ? " • Selected" : ""}`.slice(0, 72),
        })
      })

      if (selectedCount > 0) {
        rows.push({
          id: `continue_cat_${categoryId}`,
          title: "Continue →",
          description: `Configure quantity for ${selectedCount} item${selectedCount > 1 ? "s" : ""}`,
        })
      }

      rows.push({
        id: "action_categories",
        title: "🍽️ Other Categories",
        description: "Browse menu categories",
      })

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        "Select Items",
        [{ title: catName.slice(0, 24), rows }]
      )
    } else {
      const buttons: Array<{ id: string; title: string }> = []
      if (selectedCount > 0) {
        buttons.push({ id: `continue_cat_${categoryId}`, title: "Continue →" })
      }
      buttons.push({ id: "action_categories", title: "🍽️ Categories" })
      buttons.push({ id: "action_view_cart", title: "🛒 View Cart" })

      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        buttons
      )
    }
  }

  return { handled: true, responseText, intent: "category_items_selection" }
}

/**
 * STEP 4: SEQUENTIAL ITEM QUANTITY CONFIGURATION (One Item at a Time)
 */
export async function handleCategoryQuantityStep(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  categoryId: string,
  itemIndex: number
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const { selections } = await getCategorySelections(restaurant.id, sender)

  if (selections.length === 0) {
    return await handleCategoryProductsSelection(restaurant, sender, categoryId)
  }

  // Handle index boundaries
  if (itemIndex < 0) {
    return await handleCategoryProductsSelection(restaurant, sender, categoryId)
  }

  // All selected items configured -> show summary & commit options
  if (itemIndex >= selections.length) {
    const menuItems = await getWhatsAppItems(restaurant.id)
    const lines: string[] = ["*Your Selected Items:*\n"]

    let totalEstimate = 0
    selections.forEach((sel) => {
      const item = menuItems.find((i) => i.id === sel.menu_item_id)
      const cleanName = item ? item.name.replace(/^[🟢🔴]\s*/, "") : "Item"
      const price = item ? item.price : 0
      const lineTotal = price * sel.quantity
      totalEstimate += lineTotal
      lines.push(`• *${cleanName}* × ${sel.quantity}  (₹${lineTotal.toFixed(2)})`)
    })

    lines.push(`\nSubtotal: *₹${totalEstimate.toFixed(2)}*`)
    const responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: `commit_cat_${categoryId}`, title: "🛒 View Cart" },
          { id: `qstep_back_${categoryId}_${selections.length - 1}`, title: "← Back" },
          { id: "action_categories", title: "Add More Items →" },
        ]
      )
    }

    return { handled: true, responseText, intent: "category_quantity_summary" }
  }

  // Active item configuration
  const currentSel = selections[itemIndex]
  const itemDetails = await getWhatsAppItemDetails(restaurant.id, currentSel.menu_item_id)
  const cleanName = itemDetails ? itemDetails.name.replace(/^[🟢🔴]\s*/, "") : "Item"
  const priceDisplay = itemDetails ? itemDetails.price_display : ""
  const isLastItem = itemIndex === selections.length - 1
  const nextBtnTitle = isLastItem ? "Done →" : "Next →"

  const lines: string[] = []
  lines.push("Set Quantity\n")
  lines.push(`*${cleanName}*`)
  if (priceDisplay) lines.push(`${priceDisplay} each\n`)
  lines.push(`Quantity: *[ − ]  ${currentSel.quantity}  [ + ]*\n`)
  lines.push(`Step ${itemIndex + 1} of ${selections.length}`)

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    const buttons: Array<{ id: string; title: string }> = [
      { id: `qstep_inc_${categoryId}_${itemIndex}_${currentSel.menu_item_id}`, title: "[ + ] Increase" },
    ]

    if (currentSel.quantity > 1) {
      buttons.push({ id: `qstep_dec_${categoryId}_${itemIndex}_${currentSel.menu_item_id}`, title: "[ − ] Decrease" })
    } else if (itemIndex > 0) {
      buttons.push({ id: `qstep_back_${categoryId}_${itemIndex - 1}`, title: "← Back" })
    } else {
      buttons.push({ id: `cat_${categoryId}`, title: "← Back to Items" })
    }

    buttons.push({ id: `qstep_next_${categoryId}_${itemIndex + 1}`, title: nextBtnTitle })

    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      buttons.slice(0, 3) // Max 3 buttons in Meta API
    )
  }

  return { handled: true, responseText, intent: "category_quantity_step" }
}

/**
 * STEP 4: COMMIT BATCH SELECTIONS TO CART & RETURN TO MENU
 */
export async function handleCommitCategorySelections(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const updatedCart = await commitSelectionsToCart(restaurant.id, sender)
  const responseText = `✅ Selected items added to your cart!\nCart Total: *₹${updatedCart?.total.toFixed(2)}* (${updatedCart?.item_count} items)`

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "action_categories", title: "🍽️ View Menu" },
        { id: "action_view_cart", title: "🛒 View Cart" },
        { id: "cart_checkout", title: "✅ Checkout" },
      ]
    )
  }

  return { handled: true, responseText, intent: "batch_add_to_cart_success" }
}

/**
 * STEP 6: VIEW CART SUMMARY
 */
export async function handleViewCart(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, "Your cart is currently empty! 🍽️")
    }
    return await handleInitialGreeting(restaurant, sender)
  }

  const responseText = formatCartText(cart)

  if (restaurant.whatsapp_phone_number_id) {
    const rows: Array<{ id: string; title: string; description?: string }> = []
    cart.items.forEach((item) => {
      const cleanName = item.name.replace(/^[🟢🔴]\s*/, "")
      rows.push({
        id: `cart_inc_${item.id}`,
        title: `➕ Add 1 ${cleanName}`.slice(0, 24),
        description: `Qty: ${item.quantity} → ${item.quantity + 1} (₹${item.unit_price.toFixed(2)})`.slice(0, 72),
      })
      rows.push({
        id: `cart_dec_${item.id}`,
        title: `➖ Remove 1 ${cleanName}`.slice(0, 24),
        description: `Qty: ${item.quantity} → ${item.quantity - 1} ${item.quantity - 1 === 0 ? '(Remove)' : ''}`.trim().slice(0, 72),
      })
    })

    rows.push({
      id: "action_categories",
      title: "🍽️ View Menu",
      description: "Back to Menu",
    })

    rows.push({
      id: "cart_checkout",
      title: "✅ Checkout",
      description: `Total: ₹${cart.total.toFixed(2)}`,
    })

    await sendWhatsAppInteractiveList(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      "Manage Cart",
      [{ title: "Cart Items", rows }]
    )
  }

  return { handled: true, responseText, intent: "view_cart" }
}

/**
 * Item Details view
 */
export async function handleItemSelection(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  itemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const item = await getWhatsAppItemDetails(restaurant.id, itemId)

  if (!item) {
    const fallbackText = "Sorry, that item is currently unavailable."
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        fallbackText,
        [{ id: "action_categories", title: "📂 View Menu" }]
      )
    }
    return { handled: true, responseText: fallbackText, intent: "item_not_found" }
  }

  const baseDetails = formatWhatsAppProductDetailText(item)

  if (restaurant.whatsapp_phone_number_id) {
    if (item.has_variants) {
      const rows = item.variants.map((v) => ({
        id: `var_opt_${item.id}_${v.id}`,
        title: `${item.name.replace(/^[🟢🔴]\s*/, "")} (${v.name})`.slice(0, 24),
        description: `${v.price_display}`.slice(0, 72),
      }))

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        `${baseDetails}\n\n👇 *Select size/option below to add:*`,
        "Select Size",
        [{ title: "Variants", rows }]
      )
    } else {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        baseDetails,
        [
          { id: `add_${item.id}`, title: "🛒 Add to Cart" },
          { id: "action_categories", title: "📂 View Menu" },
          { id: "action_view_cart", title: "🛍️ View Cart" },
        ]
      )
    }
  }

  return { handled: true, responseText: baseDetails, intent: "item_details" }
}

export async function handleAddToCartAction(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  menuItemId: string,
  options?: { variantId?: string; addonIds?: string[] }
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const result = await addToCart(restaurant.id, sender, menuItemId, options)

  let responseText = ""
  if (!result.success) {
    responseText = `⚠️ ${result.error || "Failed to add item to cart."}`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_categories", title: "📂 View Menu" }]
      )
    }
  } else {
    const cart = result.cart
    const addedItem = cart?.items.find((i) => i.menu_item_id === menuItemId)
    const itemName = addedItem ? addedItem.name : "Item"
    const cartItemId = addedItem?.id || ""

    const lines: string[] = []
    lines.push(`✅ Added *${itemName}* to cart! 🛒\n`)
    lines.push(`Cart Total: *₹${cart?.total.toFixed(2)}* (${cart?.item_count} items)`)
    responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: `add_note_prompt_${cartItemId}`, title: "✍️ Add Note" },
          { id: "action_categories", title: "🍽️ View Menu" },
          { id: "action_view_cart", title: "🛒 View Cart" },
        ]
      )
    }
  }

  return { handled: true, responseText, intent: "add_to_cart" }
}

export async function handleAddNotePrompt(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartCheckoutStep(restaurant.id, sender, `AWAITING_NOTE_ITEM_${cartItemId}`)
  const responseText = "✍️ Please type your special instruction for this item (e.g. *\"extra spicy\"* or *\"no onions\"*):"
  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [{ id: `skip_note_${cartItemId}`, title: "⏭️ Skip" }]
    )
  }
  return { handled: true, responseText, intent: "awaiting_item_note" }
}

export async function handleInitiateCheckout(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const validation = await validateCartForCheckout(restaurant.id, sender)
  if (!validation.valid) {
    const responseText = `⚠️ ${validation.error || "Cannot proceed with checkout."}`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_view_cart", title: "🛒 View Cart" }]
      )
    }
    return { handled: true, responseText, intent: "checkout_validation_failed" }
  }

  const cart = await getCartDetails(restaurant.id, sender)
  if (!cart || cart.items.length === 0) {
    return await handleViewCart(restaurant, sender)
  }

  const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
  const existingCustomer = await prisma.customer.findUnique({
    where: { restaurant_id_phone: { restaurant_id: restaurant.id, phone: cleanPhone } },
  })

  if (existingCustomer && existingCustomer.name) {
    await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_LOCATION_CHOICE", {
      customerName: existingCustomer.name,
    })

    const responseText = `Hi *${existingCustomer.name}* 👋\nContinue with this name or change it?`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: "loc_prompt_address", title: "📍 Select Address" },
          { id: "co_change_name", title: "✏️ Change Name" },
        ]
      )
    }
    return { handled: true, responseText, intent: "awaiting_name_verification" }
  }

  await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_NAME")
  const responseText = "👤 Please reply with your *Full Name* for the delivery order:"

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "awaiting_name" }
}

async function promptForAddressSelection(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cleanPhone: string,
  customerName: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const existingCustomer = await prisma.customer.findUnique({
    where: { restaurant_id_phone: { restaurant_id: restaurant.id, phone: cleanPhone } },
    include: { addresses: true }
  })

  const addresses = existingCustomer?.addresses || []
  
  if (addresses.length > 0) {
    const rows = addresses.slice(0, 8).map((addr, idx) => ({
      id: `addr_select_${addr.id}`,
      title: `🏠 ${addr.label || 'Saved Address'}`,
      description: addr.address_line.slice(0, 72)
    }))
    rows.push({ id: "loc_share_current", title: "📍 Share New Location", description: "Send a WhatsApp location pin" })
    rows.push({ id: "loc_enter_manual", title: "✍️ Enter Manually", description: "Type your new address" })

    const responseText = `📍 *Select your delivery address, ${customerName}*`
    if (restaurant.whatsapp_phone_number_id) {
      const listRows = addresses.slice(0, 7).map((addr) => ({
        id: `addr_select_${addr.id}`,
        title: `🏠 ${addr.label || 'Saved Address'}`,
        description: addr.address_line.slice(0, 72)
      }))
      listRows.push({ id: "loc_share_current", title: "📍 Share New Location", description: "Send a WhatsApp location pin" })
      listRows.push({ id: "loc_enter_manual", title: "✍️ Enter Manually", description: "Type your new address" })
      listRows.push({ id: "co_change_name", title: "✏️ Change Name", description: "Update your name" })
      listRows.push({ id: "co_empty_cart", title: "🗑️ Empty Cart", description: "Clear cart & start over" })
      listRows.push({ id: "co_cancel", title: "❌ Cancel Order", description: "Cancel and clear cart" })

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        "Select Address",
        [{ title: "Options", rows: listRows }]
      )
    }
    return { handled: true, responseText, intent: "awaiting_location_choice_list" }
  }

  const responseText = `📍 *Where should we deliver, ${customerName}?*`
  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "loc_share_current", title: "📍 Share Location" },
        { id: "loc_enter_manual", title: "✍️ Enter Manually" },
        { id: "co_cancel", title: "❌ Cancel Order" },
      ]
    )
  }
  return { handled: true, responseText, intent: "awaiting_location_choice" }
}

async function processNewAddressDecision(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  newAddress: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cleanPhone = sender.startsWith("+") ? sender : `+${sender}`
  
  // Check if customer already has this address
  const customer = await prisma.customer.findFirst({
    where: { restaurant_id: restaurant.id, phone: cleanPhone },
    include: { addresses: true }
  })

  if (customer && customer.addresses.length > 0) {
    // Basic deduplication: check if any existing address contains the new one (or vice versa)
    const newLower = newAddress.toLowerCase().replace(/[^a-z0-9]/g, "")
    const exists = customer.addresses.some(addr => {
      const existingLower = addr.address_line.toLowerCase().replace(/[^a-z0-9]/g, "")
      return newLower.includes(existingLower) || existingLower.includes(newLower)
    })

    if (exists) {
      await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
        deliveryAddress: newAddress,
      })
      return await renderOrderConfirmation(restaurant, sender)
    }
  }

  // Address is genuinely new, ask to save it
  await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_ADDRESS_SAVE_DECISION", {
    deliveryAddress: newAddress,
  })

  const responseText = `📍 New location detected.\nWould you like to save this address for future orders?`
  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "addr_save_yes", title: "💾 Save Address" },
        { id: "addr_save_no", title: "❌ Don't Save" },
      ]
    )
  }
  return { handled: true, responseText, intent: "awaiting_address_save_decision" }
}

export async function renderOrderConfirmation(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    return await handleViewCart(restaurant, sender)
  }

  const lines: string[] = []
  lines.push(`🛒 *Confirm Your Order*\n`)
  lines.push(`👤 *Deliver To:* ${cart.customer_name || "Customer"}`)
  lines.push(`📍 *Address:* ${cart.delivery_address || "Provided Address"}\n`)

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

  const responseText = lines.join("\n")

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "co_confirm", title: "✅ Confirm Order" },
        { id: "co_cancel", title: "❌ Cancel Order" },
      ]
    )
  }

  return { handled: true, responseText, intent: "order_confirmation_prompt" }
}

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
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_view_cart", title: "🛒 View Cart" }]
      )
    }
  } else {
    const lines: string[] = []
    lines.push(`🎉 *Order Confirmed!*\n`)
    lines.push(`Order ID: *#${result.orderNumber}*`)
    lines.push(`Total: *₹${result.total?.toFixed(2)}*`)
    lines.push(`\nWe'll prepare your order shortly.`)
    responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_track_order_prompt", title: "📦 Track Order" }]
      )
    }
  }

  return { handled: true, responseText, intent: result.success ? "order_created" : "order_creation_failed" }
}

export async function handleCartQuantityChange(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string,
  delta: number
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartItemQuantity(restaurant.id, sender, cartItemId, delta, true)
  return await handleViewCart(restaurant, sender)
}

export async function handleCartItemRemoval(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await removeCartItem(restaurant.id, sender, cartItemId)
  return await handleViewCart(restaurant, sender)
}

export async function handleTextQuantityCommand(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cleanText: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    return await handleViewCart(restaurant, sender)
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

export async function handleItemNoteCommand(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  rawText: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    return await handleViewCart(restaurant, sender)
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
    const responseText = `⚠️ Invalid item number "${parts[1]}". Please check your cart.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "invalid_cart_item_number" }
  }

  const targetCartItem = cart.items[itemIdx - 1]
  await updateCartItemInstruction(restaurant.id, sender, targetCartItem.id, instruction)
  return await handleViewCart(restaurant, sender)
}

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
    const responseText = `⚠️ Could not find item "${target}".`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_categories", title: "📂 View Menu" }]
      )
    }
    return { handled: true, responseText, intent: "item_not_found" }
  }

  return await handleAddToCartAction(restaurant, sender, selectedItemId)
}

export async function handleSearchPrompt(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_SEARCH_QUERY")
  const responseText = "🔍 What are you looking for?\n\nType the product name or keyword (e.g. *\"biryani\"*):"
  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }
  return { handled: true, responseText, intent: "search_prompt" }
}

export async function handleSearchResults(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  query: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const searchResults = await getWhatsAppItems(restaurant.id, { searchQuery: query })

  if (searchResults.length === 0) {
    const responseText = `🔍 No items found matching "${query}".`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: "action_search_prompt", title: "🔍 Search Again" },
          { id: "action_categories", title: "📂 View Menu" },
        ]
      )
    }
    return { handled: true, responseText, intent: "search_no_results" }
  }

  if (searchResults.length === 1) {
    return await handleItemSelection(restaurant, sender, searchResults[0].id)
  }

  const responseText = `🔍 Search results for *"${query}"*:`

  if (restaurant.whatsapp_phone_number_id) {
    if (searchResults.length <= 10) {
      const rows = searchResults.map((item) => ({
        id: `item_${item.id}`,
        title: item.name.slice(0, 24),
        description: `${item.price_display}${item.description ? " - " + item.description : ""}`.slice(0, 72),
      }))

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        "Select Item",
        [{ title: "Matching Products", rows }]
      )
    } else {
      const lines: string[] = [responseText + "\n"]
      searchResults.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.name} - ${item.price_display}`)
      })
      lines.push(`\nReply item number to view details!`)
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, lines.join("\n"))
    }
  }

  return { handled: true, responseText, intent: "search_results" }
}
