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
} from "./cart"

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
  if (cart && (cart.checkout_step === "AWAITING_NAME" || cart.checkout_step === "AWAITING_ADDRESS" || cart.checkout_step === "AWAITING_LOCATION_CHOICE" || cart.checkout_step === "AWAITING_MANUAL_ADDRESS" || cart.checkout_step === "AWAITING_BUILDING_NO" || cart.checkout_step === "AWAITING_CONFIRMATION")) {
    if (interactiveId === "co_cancel" || cleanText === "cancel") {
      await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
      const responseText = "❌ Checkout cancelled. Your cart items are preserved."
      if (restaurant.whatsapp_phone_number_id) {
        await sendWhatsAppInteractiveButtons(
          restaurant.whatsapp_phone_number_id,
          sender,
          responseText,
          [
            { id: "action_view_cart", title: "🛒 View Cart" },
            { id: "action_main_menu", title: "📋 Main Menu" },
          ]
        )
      }
      return { handled: true, responseText, intent: "checkout_cancelled" }
    }

    if (cart.checkout_step === "AWAITING_NAME") {
      const customerName = rawText.length > 0 ? rawText : "Customer"
      await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_LOCATION_CHOICE", {
        customerName,
      })

      const responseText = `Hi *${customerName}*! How would you like to provide your delivery location?`
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

    if (cart.checkout_step === "AWAITING_LOCATION_CHOICE") {
      if (interactiveId === "loc_share_current" || cleanText.includes("share") || cleanText.includes("location")) {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_BUILDING_NO")
        const responseText = "📍 Please send your WhatsApp Location now!"
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_location_message" }
      }

      if (interactiveId === "loc_enter_manual" || cleanText.includes("manual") || cleanText.includes("enter")) {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_MANUAL_ADDRESS")
        const responseText = "✍️ Please type your complete delivery address in ONE message:\n_(e.g., Flat 402, Sunshine Apartments, Bandra East, Mumbai)_"
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_manual_address" }
      }
    }

    if (cart.checkout_step === "AWAITING_BUILDING_NO") {
      let locAddress = cart.delivery_address || ""

      if (message.type === "location" && message.location) {
        const loc = message.location
        locAddress = loc.address || loc.name || `Lat: ${loc.latitude.toFixed(4)}, Long: ${loc.longitude.toFixed(4)}`
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_BUILDING_NO", {
          deliveryAddress: locAddress,
        })
        const responseText = `📍 Received location!\nNow, please enter your *Building / Room / Flat number*:`
        if (restaurant.whatsapp_phone_number_id) {
          await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
        }
        return { handled: true, responseText, intent: "awaiting_building_number" }
      }

      if (rawText.length > 0) {
        const fullAddress = cart.delivery_address ? `${rawText}, ${cart.delivery_address}` : rawText
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
          deliveryAddress: fullAddress,
        })
        return await renderOrderConfirmation(restaurant, sender)
      }
    }

    if (cart.checkout_step === "AWAITING_MANUAL_ADDRESS" || cart.checkout_step === "AWAITING_ADDRESS") {
      if (rawText.length > 0) {
        await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_CONFIRMATION", {
          deliveryAddress: rawText,
        })
        return await renderOrderConfirmation(restaurant, sender)
      }
    }

    if (cart.checkout_step === "AWAITING_CONFIRMATION") {
      if (interactiveId === "co_confirm" || cleanText === "confirm" || cleanText === "yes" || cleanText === "place order") {
        return await handleFinalOrderCreation(restaurant, sender)
      }

      if (interactiveId === "co_edit_cart" || cleanText === "edit cart") {
        await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
        return await handleViewCart(restaurant, sender)
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
  }

  // 2. Interactive Button / List Reply Handlers
  if (interactiveId === "action_main_menu" || interactiveId === "action_categories") {
    return await handleMainMenu(restaurant, sender)
  }

  if (interactiveId === "action_search_prompt") {
    return await handleSearchPrompt(restaurant, sender)
  }

  if (interactiveId === "action_view_cart") {
    return await handleViewCart(restaurant, sender)
  }

  if (interactiveId.startsWith("cat_")) {
    const categoryId = interactiveId.replace("cat_", "")
    return await handleCategorySelection(restaurant, sender, categoryId)
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

  if (interactiveId === "cart_manage") {
    return await handleCartManageOptions(restaurant, sender)
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

  if (interactiveId === "cart_checkout" || interactiveId === "action_checkout") {
    return await handleInitiateCheckout(restaurant, sender)
  }

  if (interactiveId === "cart_clear") {
    await clearCart(restaurant.id, sender)
    const responseText = "🧹 Your cart has been cleared!"
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_main_menu", title: "📋 Browse Menu" }]
      )
    }
    return { handled: true, responseText, intent: "clear_cart" }
  }

  // Check if user is replying with a special instruction note text
  if (cart && (cart.checkout_step as string).startsWith("AWAITING_NOTE_ITEM_")) {
    const cartItemId = (cart.checkout_step as string).replace("AWAITING_NOTE_ITEM_", "")
    await updateCartItemInstruction(cartItemId, rawText)
    await updateCartCheckoutStep(restaurant.id, sender, "IDLE")
    const responseText = `📝 Note added: _"${rawText}"_`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [
          { id: "action_view_cart", title: "🛒 View Cart" },
          { id: "action_checkout", title: "💳 Checkout" },
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
  return await handleSearchResults(restaurant, sender, rawText)
}

/**
 * Prompt for Search keyword.
 */
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

/**
 * Renders Search Results as interactive list items.
 */
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
          { id: "action_main_menu", title: "📋 Main Menu" },
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

/**
 * Renders and sends Main Category Menu for a restaurant using WhatsApp Interactive List/Buttons.
 */
export async function handleMainMenu(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const categories = await getWhatsAppCategories(restaurant.id)

  const bodyText = `👋 Welcome to *${restaurant.name}*! 🍽️\nSelect a category below or search for items:`

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
        description: `${cat.item_count} items${cat.description ? " • " + cat.description : ""}`.slice(0, 72),
      }))

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        bodyText,
        "Browse Menu",
        [{ title: "Categories", rows }]
      )
    } else {
      const lines: string[] = [`👋 Welcome to *${restaurant.name}*! 🍽️\n\nExplore our categories:\n`]
      categories.forEach((cat, idx) => {
        lines.push(`${idx + 1}. *${cat.title}* (${cat.item_count} items)`)
      })
      lines.push(`\nReply with category number or name to view items!`)
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, lines.join("\n"))
    }
  }

  return { handled: true, responseText: bodyText, intent: "main_menu" }
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
  const bodyText = `📂 *${catName}* (${items.length} items):`

  if (items.length === 0) {
    const text = `No items currently available in *${catName}*.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        text,
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
      )
    }
    return { handled: true, responseText: text, intent: "category_empty" }
  }

  if (restaurant.whatsapp_phone_number_id) {
    if (items.length <= 10) {
      const rows = items.map((item) => ({
        id: `item_${item.id}`,
        title: item.name.slice(0, 24),
        description: `${item.price_display}${item.description ? " - " + item.description : ""}`.slice(0, 72),
      }))

      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        bodyText,
        "View Products",
        [{ title: catName.slice(0, 24), rows }]
      )
    } else {
      const lines: string[] = [bodyText + "\n"]
      items.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.name} - ${item.price_display}`)
      })
      lines.push(`\nReply item number to view details!`)
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, lines.join("\n"))
    }
  }

  return { handled: true, responseText: bodyText, intent: "category_items" }
}

/**
 * Renders and sends Item Details view with tap-first variant/addon buttons.
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
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
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
          { id: "action_main_menu", title: "📋 Menu" },
          { id: "action_view_cart", title: "🛍️ View Cart" },
        ]
      )
    }
  }

  return { handled: true, responseText: baseDetails, intent: "item_details" }
}

/**
 * Handles Add to Cart action for a specific menuItemId.
 */
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
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
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
          { id: "action_view_cart", title: "🛒 View Cart" },
          { id: "cart_checkout", title: "💳 Checkout" },
        ]
      )
    }
  }

  return { handled: true, responseText, intent: "add_to_cart" }
}

/**
 * Prompts user to type a special instruction note for a added cart item.
 */
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
    const responseText = `⚠️ Could not find item "${target}".`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
      )
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
    const responseText = "Your cart is currently empty!"
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
      )
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
    const responseText = `⚠️ Invalid item number "${parts[1]}". Please check your cart.`
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
    }
    return { handled: true, responseText, intent: "invalid_cart_item_number" }
  }

  const targetCartItem = cart.items[itemIdx - 1]
  await updateCartItemInstruction(targetCartItem.id, instruction)
  return await handleViewCart(restaurant, sender)
}

/**
 * Handles View Cart request with interactive button options.
 */
export async function handleViewCart(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    const text = "Your cart is currently empty! 🍽️"
    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        text,
        [
          { id: "action_main_menu", title: "📋 Browse Menu" },
          { id: "action_search_prompt", title: "🔍 Search" },
        ]
      )
    }
    return { handled: true, responseText: text, intent: "cart_empty" }
  }

  const responseText = formatCartText(cart)

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppInteractiveButtons(
      restaurant.whatsapp_phone_number_id,
      sender,
      responseText,
      [
        { id: "cart_checkout", title: "💳 Checkout" },
        { id: "cart_manage", title: "⚙️ Modify Items" },
        { id: "action_main_menu", title: "➕ Add More" },
      ]
    )
  }

  return { handled: true, responseText, intent: "view_cart" }
}

/**
 * Renders interactive list/buttons to manage individual items in cart (+, -, remove).
 */
export async function handleCartManageOptions(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  const cart = await getCartDetails(restaurant.id, sender)

  if (!cart || cart.items.length === 0) {
    return await handleViewCart(restaurant, sender)
  }

  const bodyText = "⚙️ Select a cart item action below:"

  if (restaurant.whatsapp_phone_number_id) {
    const rows: Array<{ id: string; title: string; description?: string }> = []
    cart.items.forEach((item) => {
      rows.push({
        id: `cart_inc_${item.id}`,
        title: `➕ Add 1: ${item.name}`.slice(0, 24),
        description: `Current quantity: ${item.quantity}`.slice(0, 72),
      })
      rows.push({
        id: `cart_dec_${item.id}`,
        title: `➖ Sub 1: ${item.name}`.slice(0, 24),
        description: `Current quantity: ${item.quantity}`.slice(0, 72),
      })
      rows.push({
        id: `cart_rem_${item.id}`,
        title: `❌ Remove: ${item.name}`.slice(0, 24),
        description: `Remove completely from cart`.slice(0, 72),
      })
    })

    if (rows.length <= 10) {
      await sendWhatsAppInteractiveList(
        restaurant.whatsapp_phone_number_id,
        sender,
        bodyText,
        "Modify Cart",
        [{ title: "Cart Item Actions", rows }]
      )
    } else {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        "To modify quantity, reply with e.g. *\"+1 1\"*, *\"-1 1\"*, or *\"remove 1\"*.",
        [
          { id: "action_view_cart", title: "🛒 View Cart" },
          { id: "cart_clear", title: "🧹 Clear Cart" },
        ]
      )
    }
  }

  return { handled: true, responseText: bodyText, intent: "cart_manage" }
}

/**
 * Initiates Checkout process.
 */
export async function handleInitiateCheckout(
  restaurant: ResolvedRestaurantInfo,
  sender: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  // 1. Validate Cart items for availability
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

  // Start conversational checkout
  await updateCartCheckoutStep(restaurant.id, sender, "AWAITING_NAME")

  const responseText = "👤 Please reply with your *Full Name* for the delivery order:"

  if (restaurant.whatsapp_phone_number_id) {
    await sendWhatsAppTextMessage(restaurant.whatsapp_phone_number_id, sender, responseText)
  }

  return { handled: true, responseText, intent: "awaiting_name" }
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
    return await handleViewCart(restaurant, sender)
  }

  const lines: string[] = []
  lines.push(`📋 *Order Confirmation (Cash on Delivery)*\n`)
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
        { id: "co_change_address", title: "📍 Change Address" },
        { id: "co_cancel", title: "❌ Cancel" },
      ]
    )
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
    lines.push(`✅ *Order placed successfully!*\n`)
    lines.push(`Order *#${result.orderNumber}*`)
    lines.push(`Total: *₹${result.total?.toFixed(2)}*`)
    lines.push(`Payment: *Cash on Delivery*`)
    lines.push(`Status: *New*`)
    lines.push(`\nThank you for ordering with *${restaurant.name}*! 🍽️`)
    responseText = lines.join("\n")

    if (restaurant.whatsapp_phone_number_id) {
      await sendWhatsAppInteractiveButtons(
        restaurant.whatsapp_phone_number_id,
        sender,
        responseText,
        [{ id: "action_main_menu", title: "📋 Main Menu" }]
      )
    }
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
  await updateCartItemQuantity(cartItemId, delta, true)
  return await handleViewCart(restaurant, sender)
}

/**
 * Handles Cart Item Removal.
 */
export async function handleCartItemRemoval(
  restaurant: ResolvedRestaurantInfo,
  sender: string,
  cartItemId: string
): Promise<{ handled: boolean; responseText: string; intent: string }> {
  await removeCartItem(cartItemId)
  return await handleViewCart(restaurant, sender)
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
