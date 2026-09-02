import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId } from "./restaurant"
import { processIncomingWhatsAppMessage } from "./router"
import { getCartDetails, addToCart } from "./cart"

export async function runWhatsAppOrderFlowTests() {
  console.log("=========================================")
  console.log("STARTING WHATSAPP ORDER CREATION SUITE")
  console.log("=========================================\n")

  const PHONE_ID_SAGAR = "7777777777777777"
  const PHONE_ID_DSM = "8888888888888888"
  const CUSTOMER_SENDER = "919876543210"

  let sagarId = ""
  let dsmId = ""
  let biryaniId = ""
  let paneerId = ""
  let unavailId = ""

  try {
    // 1. Setup Test Data
    console.log("1. Creating test restaurants & menu items...")

    const existingRestos = await prisma.restaurant.findMany({
      where: { slug: { in: ["sagar-order-test", "dsmaundar-order-test"] } },
      select: { id: true },
    })

    if (existingRestos.length > 0) {
      const existingIds = existingRestos.map((r) => r.id)
      await prisma.order.deleteMany({
        where: { restaurant_id: { in: existingIds } },
      })
      await prisma.restaurant.deleteMany({
        where: { id: { in: existingIds } },
      })
    }

    const sagar = await prisma.restaurant.create({
      data: {
        name: "Sagar Feast",
        slug: "sagar-order-test",
        whatsapp_phone_number_id: PHONE_ID_SAGAR,
        delivery_fee: 30,
      },
    })
    sagarId = sagar.id

    const dsm = await prisma.restaurant.create({
      data: {
        name: "Dsmaundar Beach Cafe",
        slug: "dsmaundar-order-test",
        whatsapp_phone_number_id: PHONE_ID_DSM,
        delivery_fee: 40,
      },
    })
    dsmId = dsm.id

    const sagarCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: sagarId,
        name: "Main Course",
      },
    })

    const item1 = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Special Dum Biryani",
        price: 320,
        is_veg: false,
        is_available: true,
      },
    })
    biryaniId = item1.id

    const item2 = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Butter Naan",
        price: 50,
        is_veg: true,
        is_available: true,
      },
    })
    paneerId = item2.id

    const item3 = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Limited Thali",
        price: 200,
        is_veg: true,
        is_available: false,
      },
    })
    unavailId = item3.id

    console.log(`✓ Setup complete for Sagar Feast (${sagarId}) & Dsmaundar Beach Cafe (${dsmId})\n`)

    const sagarRestaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_SAGAR)
    if (!sagarRestaurant) throw new Error("Sagar restaurant lookup failed")

    // TEST 1: Optional Special Instruction
    console.log("TEST 1: Customer adds item to cart and specifies 'note 1 extra spicy'")
    await addToCart(sagarId, CUSTOMER_SENDER, biryaniId, { quantity: 1 })

    const noteRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_note",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "note 1 extra spicy",
    })

    const cartWithNote = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartWithNote && cartWithNote.items[0].special_instructions === "extra spicy") {
      console.log("✓ PASS: Special instruction 'extra spicy' stored on cart item\n")
    } else {
      throw new Error(`TEST 1 FAILED: Special instruction not saved: ${noteRes.responseText}`)
    }

    // TEST 2: Cart Review
    console.log("TEST 2: Customer reviews cart ('view cart')")
    const cartRev = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_cart",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "cart",
    })

    if (
      cartRev.handled &&
      cartRev.responseText.includes("Special Dum Biryani") &&
      cartRev.responseText.includes("extra spicy") &&
      cartRev.responseText.includes("Subtotal:* ₹320.00") &&
      cartRev.responseText.includes("Delivery Fee:* ₹30.00") &&
      cartRev.responseText.includes("Total:* ₹350.00")
    ) {
      console.log("✓ PASS: Cart review displayed item name, instruction, subtotal, delivery fee & total\n")
    } else {
      throw new Error(`TEST 2 FAILED: Cart review output mismatch: ${cartRev.responseText}`)
    }

    // TEST 3: Unavailable Item During Checkout Rejection
    console.log("TEST 3: Checkout validation rejects cart containing an item that became unavailable")
    // Add thali item to cart while temporarily available
    await prisma.menuItem.update({
      where: { id: unavailId },
      data: { is_available: true },
    })
    await addToCart(sagarId, CUSTOMER_SENDER, unavailId, { quantity: 1 })

    // Mark thali item unavailable in DB
    await prisma.menuItem.update({
      where: { id: unavailId },
      data: { is_available: false },
    })

    const checkoutUnavailRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_co_unavail",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "checkout",
    })

    if (
      checkoutUnavailRes.handled &&
      checkoutUnavailRes.intent === "checkout_validation_failed" &&
      checkoutUnavailRes.responseText.includes("unavailable")
    ) {
      console.log("✓ PASS: Checkout correctly rejected due to unavailable item in cart\n")
    } else {
      throw new Error(`TEST 3 FAILED: Unavailable item was not rejected during checkout!`)
    }

    // Clean up unavailable item from cart
    const cartStateTemp = await getCartDetails(sagarId, CUSTOMER_SENDER)
    const unavailCartItem = cartStateTemp?.items.find((i) => i.menu_item_id === unavailId)
    if (unavailCartItem) {
      await processIncomingWhatsAppMessage(sagarRestaurant, {
        id: "msg_clean",
        from: CUSTOMER_SENDER,
        type: "text",
        textBody: `remove ${cartStateTemp?.items.indexOf(unavailCartItem)! + 1}`,
      })
    }

    // TEST 4: Price Safety & Recalculation from DB
    console.log("TEST 4: Price recalculation safety check (DB price changed after cart addition)")
    // Update DB price of Biryani from 320 to 350
    await prisma.menuItem.update({
      where: { id: biryaniId },
      data: { price: 350 },
    })

    // Add Butter Naan (x2 @ 50 = 100) -> New Subtotal should be 350 + 100 = 450 + 30 delivery = 480
    await addToCart(sagarId, CUSTOMER_SENDER, paneerId, { quantity: 2 })

    // TEST 5: Full Checkout & Conversational Address Entry Flow
    console.log("TEST 5: Initiate checkout & complete conversational details entry")
    const coInitRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_co",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "checkout",
    })

    if (coInitRes.handled && coInitRes.intent === "awaiting_name") {
      console.log("✓ PASS: System requested customer name\n")
    } else {
      throw new Error(`TEST 5 FAILED: Expected name request: ${coInitRes.responseText}`)
    }

    console.log("Customer provides name: 'Rahul Sharma'")
    const nameRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_name",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "Rahul Sharma",
    })

    if (nameRes.handled && nameRes.intent === "awaiting_location_choice") {
      console.log("✓ PASS: System presented location choice buttons\n")
    } else {
      throw new Error(`TEST 5 FAILED: Expected location choice: ${nameRes.responseText}`)
    }

    console.log("Customer selects manual address entry ('loc_enter_manual')")
    const locChoiceRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_loc_choice",
      from: CUSTOMER_SENDER,
      interactiveId: "loc_enter_manual",
      type: "interactive",
    })

    if (locChoiceRes.handled && locChoiceRes.intent === "awaiting_manual_address") {
      console.log("✓ PASS: System prompted for manual address entry\n")
    } else {
      throw new Error(`TEST 5 FAILED: Expected manual address prompt: ${locChoiceRes.responseText}`)
    }

    console.log("Customer submits address: '102 Beach Road, Sagar Street'")
    const addressRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_addr",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "102 Beach Road, Sagar Street",
    })

    if (
      addressRes.handled &&
      addressRes.intent === "order_confirmation_prompt" &&
      addressRes.responseText.includes("Rahul Sharma") &&
      addressRes.responseText.includes("Subtotal:* ₹420.00") &&
      addressRes.responseText.includes("Total Amount:* ₹450.00")
    ) {
      console.log("✓ PASS: Confirmation screen displayed cart subtotal ₹420.00 & total ₹450.00\n")
    } else {
      throw new Error(`TEST 5 FAILED: Confirmation screen output mismatch: ${addressRes.responseText}`)
    }

    // TEST 6: Explicit Order Confirmation & DB Creation
    console.log("TEST 6: Customer confirms order ('co_confirm')")
    const confirmRes = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_confirm",
      from: CUSTOMER_SENDER,
      interactiveId: "co_confirm",
      type: "interactive",
    })

    if (
      confirmRes.handled &&
      confirmRes.intent === "order_created" &&
      confirmRes.responseText.includes("Order placed successfully") &&
      confirmRes.responseText.includes("Cash on Delivery")
    ) {
      console.log("✓ PASS: WhatsApp response returned order success message with COD status\n")
    } else {
      throw new Error(`TEST 6 FAILED: Order creation response failed: ${confirmRes.responseText}`)
    }

    // TEST 7: DB Verification of Order, Customer, OrderItems, and Snapshots
    console.log("TEST 7: DB Order & OrderItem verification")
    const createdOrder = await prisma.order.findFirst({
      where: { restaurant_id: sagarId },
      include: { items: true, customer: true },
    })

    if (!createdOrder) throw new Error("TEST 7 FAILED: Order record was not found in DB!")

    if (
      createdOrder.source === "WHATSAPP" &&
      createdOrder.payment_method === "COD" &&
      createdOrder.payment_status === "PENDING" &&
      createdOrder.status === "NEW" &&
      createdOrder.subtotal === 450 &&
      createdOrder.delivery_fee === 30 &&
      createdOrder.total === 480 &&
      createdOrder.customer_name_snapshot === "Rahul Sharma" &&
      createdOrder.items.length === 2
    ) {
      console.log(`✓ PASS: Order #${createdOrder.order_number} verified in DB with COD, WHATSAPP source, subtotal ₹450, total ₹480`)
    } else {
      throw new Error(`TEST 7 FAILED: Order field values incorrect: ${JSON.stringify(createdOrder)}`)
    }

    const biryaniItemSnapshot = createdOrder.items.find((i) => i.item_name_snapshot === "Special Dum Biryani")
    if (
      biryaniItemSnapshot &&
      biryaniItemSnapshot.unit_price_snapshot === 350 &&
      biryaniItemSnapshot.line_total === 350 &&
      biryaniItemSnapshot.description?.includes("extra spicy")
    ) {
      console.log("✓ PASS: OrderItem snapshot accurately stored recalculated unit price ₹350 and note 'extra spicy'\n")
    } else {
      throw new Error(`TEST 7 FAILED: OrderItem snapshot invalid: ${JSON.stringify(biryaniItemSnapshot)}`)
    }

    // TEST 8: Cart Cleared After Successful Order
    console.log("TEST 8: Verify cart cleared after successful order placement")
    const sagarCartAfterOrder = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (sagarCartAfterOrder && sagarCartAfterOrder.items.length === 0) {
      console.log("✓ PASS: Customer cart cleared completely after successful order\n")
    } else {
      throw new Error("TEST 8 FAILED: Cart was not cleared after order creation!")
    }

    // TEST 9: Multi-Restaurant Order Isolation
    console.log("TEST 9: Multi-restaurant order isolation check")
    const dsmOrdersCount = await prisma.order.count({
      where: { restaurant_id: dsmId },
    })
    if (dsmOrdersCount === 0) {
      console.log("✓ PASS: Dsmaundar Beach Cafe has 0 orders (100% tenant isolation)\n")
    } else {
      throw new Error("TEST 9 FAILED: Order leaked into incorrect restaurant tenant!")
    }

    // TEST 10: Failed Order Does Not Clear Cart
    console.log("TEST 10: Verify failed order does NOT clear customer cart")
    await addToCart(sagarId, CUSTOMER_SENDER, paneerId, { quantity: 1 })
    // Mark item unavailable before attempting order creation
    await prisma.menuItem.update({
      where: { id: paneerId },
      data: { is_available: false },
    })

    await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_co_fail",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "checkout",
    })

    const cartAfterFail = await getCartDetails(sagarId, CUSTOMER_SENDER)
    if (cartAfterFail && cartAfterFail.items.length === 1) {
      console.log("✓ PASS: Failed checkout preserved cart items without clearing\n")
    } else {
      throw new Error("TEST 10 FAILED: Failed checkout incorrectly wiped cart items!")
    }

    console.log("=========================================")
    console.log("ALL WHATSAPP ORDER CREATION TESTS PASSED 100%")
    console.log("=========================================")

  } finally {
    console.log("\nCleaning up order flow test data...")
    if (sagarId || dsmId) {
      await prisma.order.deleteMany({
        where: {
          restaurant_id: { in: [sagarId, dsmId].filter(Boolean) },
        },
      })
      await prisma.restaurant.deleteMany({
        where: {
          slug: { in: ["sagar-order-test", "dsmaundar-order-test"] },
        },
      })
    }
    console.log("✓ Cleanup finished.")
  }
}
