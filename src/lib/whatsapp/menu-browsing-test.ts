import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId } from "./restaurant"
import { processIncomingWhatsAppMessage } from "./router"

export async function runWhatsAppMenuBrowsingTests() {
  console.log("=========================================")
  console.log("STARTING WHATSAPP MENU BROWSING SUITE")
  console.log("=========================================\n")

  const PHONE_ID_SAGAR = "3333333333333333"
  const PHONE_ID_DSM = "4444444444444444"
  const PHONE_ID_UNKNOWN = "9999999999999999"

  const CUSTOMER_SENDER = "919876543210"

  let sagarId = ""
  let dsmId = ""
  let sagarCatId = ""
  let sagarItemId = ""

  try {
    // 1. Setup Test Data (Sagar Hotel & Dsmaundar Hotel)
    console.log("1. Creating test restaurants, categories, variants, and add-ons...")

    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-menu-test", "dsmaundar-menu-test"] },
      },
    })

    const sagar = await prisma.restaurant.create({
      data: {
        name: "Sagar Royal Hotel",
        slug: "sagar-menu-test",
        whatsapp_phone_number_id: PHONE_ID_SAGAR,
      },
    })
    sagarId = sagar.id

    const sagarCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: sagarId,
        name: "Biryani Specials",
        sort_order: 1,
      },
    })
    sagarCatId = sagarCat.id

    const sagarItem = await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCatId,
        name: "Special Mutton Biryani",
        description: "Rich and spicy dum mutton biryani served with raita.",
        price: 350,
        is_veg: false,
        prep_time_minutes: 30,
        is_bestseller: true,
        variants: {
          create: [
            { name: "Half Plate", price: 200 },
            { name: "Full Plate", price: 350 },
          ],
        },
        addons: {
          create: [
            { name: "Extra Gravy", price: 40 },
          ],
        },
      },
    })
    sagarItemId = sagarItem.id

    const dsm = await prisma.restaurant.create({
      data: {
        name: "Dsmaundar Beach Resort",
        slug: "dsmaundar-menu-test",
        whatsapp_phone_number_id: PHONE_ID_DSM,
      },
    })
    dsmId = dsm.id

    const dsmCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: dsmId,
        name: "Seafood Delights",
        sort_order: 1,
      },
    })

    await prisma.menuItem.create({
      data: {
        restaurant_id: dsmId,
        category_id: dsmCat.id,
        name: "Grilled Pomfret",
        description: "Fresh sea pomfret grilled with Goan spices.",
        price: 550,
        is_veg: false,
      },
    })

    console.log(`✓ Test environment ready for Sagar Royal (${sagarId}) & Dsmaundar Beach (${dsmId})\n`)

    // TEST 1: Greeting "hi" / "menu" -> Returns Main Category Menu
    console.log("TEST 1: Customer sends 'hi' / 'menu'")
    const sagarRestaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_SAGAR)
    if (!sagarRestaurant) throw new Error("Sagar restaurant lookup failed")

    const resGreeting = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_1",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "hi",
    })

    if (
      resGreeting.handled &&
      resGreeting.intent === "main_menu" &&
      resGreeting.responseText.includes("Sagar Royal Hotel") &&
      resGreeting.responseText.includes("Biryani Specials")
    ) {
      console.log("✓ PASS: Greeting returned Sagar Royal main menu with category 'Biryani Specials'\n")
    } else {
      throw new Error(`TEST 1 FAILED: Unexpected greeting output: ${resGreeting.responseText}`)
    }

    // TEST 2: Category Selection ("1" or category name)
    console.log("TEST 2: Customer selects category '1'")
    const resCatSelect = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_2",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "1",
    })

    if (
      resCatSelect.handled &&
      resCatSelect.intent === "category_items" &&
      resCatSelect.responseText.includes("Biryani Specials") &&
      resCatSelect.responseText.includes("Special Mutton Biryani") &&
      resCatSelect.responseText.includes("₹350.00")
    ) {
      console.log("✓ PASS: Category selection returned items list for 'Biryani Specials'\n")
    } else {
      throw new Error(`TEST 2 FAILED: Category selection failed: ${resCatSelect.responseText}`)
    }

    // TEST 3: Item Selection (Item Name or ID)
    console.log("TEST 3: Customer selects item 'Special Mutton Biryani'")
    const resItemSelect = await processIncomingWhatsAppMessage(sagarRestaurant, {
      id: "msg_3",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "Special Mutton Biryani",
    })

    if (
      resItemSelect.handled &&
      resItemSelect.intent === "item_details" &&
      resItemSelect.responseText.includes("Special Mutton Biryani") &&
      resItemSelect.responseText.includes("Rich and spicy dum mutton biryani") &&
      resItemSelect.responseText.includes("Price:* ₹350.00") &&
      resItemSelect.responseText.includes("Prep Time:* 30 mins") &&
      resItemSelect.responseText.includes("Half Plate") &&
      resItemSelect.responseText.includes("Extra Gravy")
    ) {
      console.log("✓ PASS: Item selection returned complete details, prep time, variants & add-ons\n")
    } else {
      throw new Error(`TEST 3 FAILED: Item selection failed: ${resItemSelect.responseText}`)
    }

    // TEST 4: Unknown phone_number_id Rejection
    console.log("TEST 4: Webhook unknown phone_number_id rejection check")
    const unknownRes = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_UNKNOWN)
    if (unknownRes === null) {
      console.log("✓ PASS: Unknown phone_number_id strictly rejected (returns null)\n")
    } else {
      throw new Error("TEST 4 FAILED: Unknown phone_number_id was not rejected!")
    }

    // TEST 5: Tenant Menu Isolation Check
    console.log("TEST 5: Tenant Menu Isolation Check")
    const dsmRestaurant = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_DSM)
    if (!dsmRestaurant) throw new Error("Dsmaundar restaurant lookup failed")

    const resDsmGreeting = await processIncomingWhatsAppMessage(dsmRestaurant, {
      id: "msg_4",
      from: CUSTOMER_SENDER,
      type: "text",
      textBody: "menu",
    })

    const isSagarItemInDsm = resDsmGreeting.responseText.includes("Biryani")
    const isDsmItemInSagar = resGreeting.responseText.includes("Seafood")

    if (!isSagarItemInDsm && !isDsmItemInSagar) {
      console.log("✓ PASS: Sagar & Dsmaundar menus are 100% isolated (Zero data leak)\n")
    } else {
      throw new Error("TEST 5 FAILED: Cross-tenant menu data leak detected!")
    }

    console.log("=========================================")
    console.log("ALL WHATSAPP MENU BROWSING TESTS PASSED 100%")
    console.log("=========================================")

  } finally {
    console.log("\nCleaning up menu browsing test data...")
    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-menu-test", "dsmaundar-menu-test"] },
      },
    })
    console.log("✓ Cleanup finished.")
  }
}
