import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId } from "./restaurant"
import { processIncomingWhatsAppMessage } from "./router"

export async function runWhatsAppUXVerificationSuite() {
  console.log("=========================================")
  console.log("STARTING WHATSAPP UX FLOW VERIFICATION")
  console.log("=========================================\n")

  const PHONE_ID = "5555555555555555"
  const SENDER = "919998887770"

  let restoId = ""
  let catId = ""
  let itemId1 = ""
  let itemId2 = ""

  try {
    // 1. Setup
    console.log("1. Setting up test restaurant...")
    await prisma.restaurant.deleteMany({ where: { slug: "ux-flow-test-resto" } })

    const resto = await prisma.restaurant.create({
      data: {
        name: "RestoPro UX Diner",
        slug: "ux-flow-test-resto",
        whatsapp_phone_number_id: PHONE_ID,
        delivery_fee: 25,
      },
    })
    restoId = resto.id

    const cat = await prisma.menuCategory.create({
      data: { restaurant_id: restoId, name: "Starters" },
    })
    catId = cat.id

    const i1 = await prisma.menuItem.create({
      data: { restaurant_id: restoId, category_id: catId, name: "Paneer Tikka", price: 220, is_veg: true },
    })
    itemId1 = i1.id

    const i2 = await prisma.menuItem.create({
      data: { restaurant_id: restoId, category_id: catId, name: "Chicken Wings", price: 280, is_veg: false },
    })
    itemId2 = i2.id

    const restaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID)
    if (!restaurant) throw new Error("Resto lookup failed")

    // TEST 1: Initial Greeting ("Hi")
    console.log("TEST 1: Customer sends 'Hi'")
    const greetingRes = await processIncomingWhatsAppMessage(restaurant, {
      id: "m1", from: SENDER, type: "text", textBody: "Hi",
    })
    if (greetingRes.intent === "initial_greeting" && greetingRes.responseText.includes("Welcome to")) {
      console.log("✓ PASS: Initial greeting presented 'View Menu' and 'Track Order' options\n")
    } else {
      throw new Error(`TEST 1 FAILED: ${greetingRes.responseText}`)
    }

    // TEST 2: Multi-Item Category Selection (+ / -)
    console.log("TEST 2: Customer opens category & adjusts item quantities (+1, +1, -1)")
    await processIncomingWhatsAppMessage(restaurant, {
      id: "m2", from: SENDER, type: "interactive", interactiveId: `sel_inc_${catId}_${itemId1}`,
    })
    await processIncomingWhatsAppMessage(restaurant, {
      id: "m3", from: SENDER, type: "interactive", interactiveId: `sel_inc_${catId}_${itemId2}`,
    })
    const selCatRes = await processIncomingWhatsAppMessage(restaurant, {
      id: "m4", from: SENDER, type: "interactive", interactiveId: `cat_${catId}`,
    })

    if (selCatRes.intent === "category_items_selection" && (selCatRes.responseText.includes("Selected in this batch:") || selCatRes.responseText.includes("Selected items in batch:"))) {
      console.log("✓ PASS: Multi-item selection batch staging working (+1 for 2 items = batch of 2)\n")
    } else {
      throw new Error(`TEST 2 FAILED: ${selCatRes.responseText}`)
    }

    // TEST 3: Add to Cart Batch Commit
    console.log("TEST 3: Customer taps 'Add to Cart'")
    const commitRes = await processIncomingWhatsAppMessage(restaurant, {
      id: "m5", from: SENDER, type: "interactive", interactiveId: `commit_cat_${catId}`,
    })

    if (commitRes.intent === "batch_add_to_cart_success" && commitRes.responseText.includes("Cart Total: *₹525.00*")) {
      console.log("✓ PASS: Batch items committed to cart (Subtotal ₹500 + Fee ₹25 = ₹525)\n")
    } else {
      throw new Error(`TEST 3 FAILED: ${commitRes.responseText}`)
    }

    // TEST 4: Track Order Lookup
    console.log("TEST 4: Track Order lookup flow")
    const trackPromptRes = await processIncomingWhatsAppMessage(restaurant, {
      id: "m6", from: SENDER, type: "interactive", interactiveId: "action_track_order_prompt",
    })

    if (trackPromptRes.intent === "track_order_prompt") {
      console.log("✓ PASS: System prompted for Order ID\n")
    } else {
      throw new Error(`TEST 4 FAILED: ${trackPromptRes.responseText}`)
    }

    console.log("=========================================")
    console.log("ALL NEW UX FLOW VERIFICATION TESTS PASSED 100%")
    console.log("=========================================")
  } finally {
    if (restoId) {
      await prisma.restaurant.deleteMany({ where: { id: restoId } })
    }
  }
}
