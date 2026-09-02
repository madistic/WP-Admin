import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId } from "./restaurant"
import { processIncomingWhatsAppMessage } from "./router"
import { getCartDetails, addToCart } from "./cart"

export async function runWhatsAppCartTests() {
  console.log("=========================================")
  console.log("STARTING WHATSAPP SEARCH & CART TEST SUITE")
  console.log("=========================================\n")

  const PHONE_ID_SAGAR = "5555555555555555"
  const PHONE_ID_DSM = "6666666666666666"

  const CUSTOMER_SENDER = "919876543210"

  let sagarId = ""
  let dsmId = ""
  let biryaniId = ""
  let paneerId = ""
  let unavailableItemId = ""

  try {
    // 1. Setup Test Data
    console.log("1. Creating test restaurants, active items, and unavailable item...")

    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-cart-test", "dsmaundar-cart-test"] },
      },
    })

    const sagar = await prisma.restaurant.create({
      data: {
        name: "Sagar Express",
        slug: "sagar-cart-test",
        whatsapp_phone_number_id: PHONE_ID_SAGAR,
        delivery_fee: 30,
      },
    })
    sagarId = sagar.id

    const sagarCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: sagarId,
        name: "Main Course",
        sort_order: 1,
      },
    })

    const item1 = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Hyderabadi Chicken Biryani",
        description: "Spicy chicken biryani with mirchi ka salan.",
        price: 300,
        is_veg: false,
        is_available: true,
      },
    })
    biryaniId = item1.id

    const item2 = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Paneer Tikka Masala",
        description: "Charcoal grilled paneer in rich gravy.",
        price: 260,
        is_veg: true,
        is_available: true,
      },
    })
    paneerId = item2.id

    const itemUnavailable = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Seasonal Mango Kulfi",
        description: "Special summer dessert.",
        price: 120,
        is_veg: true,
        is_available: false, // UNAVAILABLE
      },
    })
    unavailableItemId = itemUnavailable.id

    const dsm = await prisma.restaurant.create({
      data: {
        name: "Dsmaundar Diner",
        slug: "dsmaundar-cart-test",
        whatsapp_phone_number_id: PHONE_ID_DSM,
        delivery_fee: 40,
      },
    })
    dsmId = dsm.id

    console.log(`✓ Setup complete for Sagar Express (${sagarId}) & Dsmaundar Diner (${dsmId})\n`)

    const sagarRestaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_SAGAR)
    if (!sagarRestaurant) throw new Error("Sagar restaurant lookup failed")

    // TEST 1: Search Product by Keyword ("biryani")
    console.log("TEST 1: Customer searches for 'biryani'")
    const searchRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_search",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "biryani",
    })

    if (
      searchRes.handled &&
      (searchRes.intent === "item_details" || searchRes.intent === "search_results") &&
      searchRes.responseText.includes("Hyderabadi Chicken Biryani")
    ) {
      console.log("✓ PASS: Search returned matching product 'Hyderabadi Chicken Biryani'\n")
    } else {
      throw new Error(`TEST 1 FAILED: Search output unexpected: ${searchRes.responseText}`)
    }

    // TEST 2: Add to Cart (Single Product)
    console.log("TEST 2: Customer adds 'Hyderabadi Chicken Biryani' to cart")
    const addRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_add1",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: `add ${biryaniId}`,
    })

    if (
      addRes.handled &&
      addRes.intent === "add_to_cart" &&
      addRes.responseText.includes("Added *Hyderabadi Chicken Biryani*")
    ) {
      console.log("✓ PASS: Successfully added product to cart with default qty = 1\n")
    } else {
      throw new Error(`TEST 2 FAILED: Add to cart failed: ${addRes.responseText}`)
    }

    // TEST 3: Add Multiple Products to Same Cart
    console.log("TEST 3: Customer adds second product ('Paneer Tikka Masala') to cart")
    await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_add2",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: `add ${paneerId}`,
    })

    const cartState = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartState && cartState.items.length === 2 && cartState.subtotal === 560) {
      console.log(`✓ PASS: Cart now contains 2 distinct items (Subtotal: ₹${cartState.subtotal})\n`)
    } else {
      throw new Error(`TEST 3 FAILED: Cart items count or subtotal mismatch: ${JSON.stringify(cartState)}`)
    }

    // TEST 4: Quantity Increase (+1)
    console.log("TEST 4: Customer increases quantity of item 1 (+1 1)")
    const incRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_inc",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "+1 1",
    })

    const cartAfterInc = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartAfterInc && cartAfterInc.items[0].quantity === 2 && cartAfterInc.subtotal === 860) {
      console.log("✓ PASS: Quantity increased to 2, subtotal updated to ₹860\n")
    } else {
      throw new Error(`TEST 4 FAILED: Quantity increase failed: ${incRes.responseText}`)
    }

    // TEST 5: Quantity Decrease (-1)
    console.log("TEST 5: Customer decreases quantity of item 1 (-1 1)")
    await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_dec",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "-1 1",
    })

    const cartAfterDec = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartAfterDec && cartAfterDec.items[0].quantity === 1 && cartAfterDec.subtotal === 560) {
      console.log("✓ PASS: Quantity decreased back to 1, subtotal updated to ₹560\n")
    } else {
      throw new Error(`TEST 5 FAILED: Quantity decrease failed`)
    }

    // TEST 6: Remove Item
    console.log("TEST 6: Customer removes item 2 ('remove 2')")
    await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_rem",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "remove 2",
    })

    const cartAfterRem = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartAfterRem && cartAfterRem.items.length === 1) {
      console.log("✓ PASS: Item 2 removed cleanly from cart\n")
    } else {
      throw new Error(`TEST 6 FAILED: Item removal failed`)
    }

    // TEST 7: Restaurant Cart Isolation
    console.log("TEST 7: Check multi-tenant cart isolation between Sagar Express & Dsmaundar Diner")
    const dsmRestaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_DSM)
    if (!dsmRestaurant) throw new Error("Dsmaundar restaurant lookup failed")

    const dsmCartBefore = await getCartDetails(dsmId, CUSTOMER_SENDER)
    if (dsmCartBefore && dsmCartBefore.items.length === 0) {
      console.log("✓ PASS: Dsmaundar Diner cart is completely empty for same customer number\n")
    } else {
      throw new Error("TEST 7 FAILED: Cross-restaurant cart leak detected!")
    }

    // TEST 8: Unavailable Item Rejection
    console.log("TEST 8: Rejection of unavailable item ('Seasonal Mango Kulfi')")
    const unavailResult = await addToCart(sagarId, CUSTOMER_SENDER, unavailableItemId)
    if (!unavailResult.success && unavailResult.error?.includes("unavailable")) {
      console.log(`✓ PASS: Unavailable item safely rejected with error: "${unavailResult.error}"\n`)
    } else {
      throw new Error(`TEST 8 FAILED: Unavailable item was incorrectly allowed into cart!`)
    }

    console.log("=========================================")
    console.log("ALL WHATSAPP SEARCH & CART TESTS PASSED 100%")
    console.log("=========================================")

  } finally {
    console.log("\nCleaning up cart test data...")
    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-cart-test", "dsmaundar-cart-test"] },
      },
    })
    console.log("✓ Cleanup finished.")
  }
}
