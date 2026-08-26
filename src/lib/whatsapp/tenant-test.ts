import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId, getOrCreateCustomerForRestaurant } from "./restaurant"
import { getRestaurantMenu } from "./menu"

export async function runMultiTenantWhatsAppTests() {
  console.log("=========================================")
  console.log("STARTING MULTI-TENANT ISOLATION SUITE")
  console.log("=========================================\n")

  const PHONE_ID_SAGAR = "1111111111111111"
  const PHONE_ID_DSM = "2222222222222222"
  const PHONE_ID_UNKNOWN = "9999999999999999"

  const CUSTOMER_PHONE = "+919876543210"

  let sagarId = ""
  let dsmId = ""

  try {
    // 1. Setup Test Data (Sagar Hotel & Dsmaundar Hotel)
    console.log("1. Setting up test restaurants & menus...")

    // Cleanup previous test data if any
    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-hotel-test", "dsmaundar-hotel-test"] }
      }
    })

    const sagar = await prisma.restaurant.create({
      data: {
        name: "Sagar Hotel",
        slug: "sagar-hotel-test",
        whatsapp_phone_number_id: PHONE_ID_SAGAR,
      }
    })
    sagarId = sagar.id

    const sagarCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: sagarId,
        name: "Sagar Specials",
      }
    })

    await prisma.menuItem.create({
      data: {
        restaurant_id: sagarId,
        category_id: sagarCat.id,
        name: "Sagar Special Dosa",
        price: 120,
      }
    })

    const dsm = await prisma.restaurant.create({
      data: {
        name: "Dsmaundar Hotel",
        slug: "dsmaundar-hotel-test",
        whatsapp_phone_number_id: PHONE_ID_DSM,
      }
    })
    dsmId = dsm.id

    const dsmCat = await prisma.menuCategory.create({
      data: {
        restaurant_id: dsmId,
        name: "Dsmaundar Specials",
      }
    })

    await prisma.menuItem.create({
      data: {
        restaurant_id: dsmId,
        category_id: dsmCat.id,
        name: "Dsmaundar Thali",
        price: 250,
      }
    })

    console.log(`✓ Created Sagar Hotel (${sagarId}) with phone_number_id: ${PHONE_ID_SAGAR}`)
    console.log(`✓ Created Dsmaundar Hotel (${dsmId}) with phone_number_id: ${PHONE_ID_DSM}\n`)

    // TEST A: Sagar Hotel WhatsApp number → Sagar Hotel restaurant_id
    console.log("TEST A: Sagar Hotel phone_number_id lookup")
    const resSagar = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_SAGAR)
    if (resSagar?.id === sagarId && resSagar?.name === "Sagar Hotel") {
      console.log("✓ PASS: Correctly resolved Sagar Hotel restaurant_id\n")
    } else {
      throw new Error(`TEST A FAILED: Resolved wrong restaurant: ${JSON.stringify(resSagar)}`)
    }

    // TEST B: Dsmaundar Hotel WhatsApp number → Dsmaundar Hotel restaurant_id
    console.log("TEST B: Dsmaundar Hotel phone_number_id lookup")
    const resDsm = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_DSM)
    if (resDsm?.id === dsmId && resDsm?.name === "Dsmaundar Hotel") {
      console.log("✓ PASS: Correctly resolved Dsmaundar Hotel restaurant_id\n")
    } else {
      throw new Error(`TEST B FAILED: Resolved wrong restaurant: ${JSON.stringify(resDsm)}`)
    }

    // TEST C & D: Menu Isolation Check
    console.log("TEST C & D: Multi-Tenant Menu Isolation Check")
    const sagarMenu = await getRestaurantMenu(sagarId)
    const dsmMenu = await getRestaurantMenu(dsmId)

    const hasSagarItemInDsm = dsmMenu.items.some(i => i.name.includes("Sagar"))
    const hasDsmItemInSagar = sagarMenu.items.some(i => i.name.includes("Dsmaundar"))

    if (!hasSagarItemInDsm && !hasDsmItemInSagar && sagarMenu.items.length > 0 && dsmMenu.items.length > 0) {
      console.log("✓ PASS: Sagar customer never receives Dsmaundar menu and vice versa\n")
    } else {
      throw new Error("TEST C/D FAILED: Menu data leaked across restaurant isolation boundaries!")
    }

    // TEST E: Unknown phone_number_id rejection
    console.log("TEST E: Unknown phone_number_id lookup handling")
    const resUnknown = await getRestaurantByWhatsAppPhoneNumberId(PHONE_ID_UNKNOWN)
    if (resUnknown === null) {
      console.log("✓ PASS: Unknown phone_number_id safely rejected (returns null)\n")
    } else {
      throw new Error(`TEST E FAILED: Expected null for unknown ID, got: ${JSON.stringify(resUnknown)}`)
    }

    // TEST F: Same Customer Phone Number across 2 Restaurants (2 separate Customer records)
    console.log("TEST F: Same customer phone number across separate restaurants")
    const custSagar = await getOrCreateCustomerForRestaurant(sagarId, CUSTOMER_PHONE, "Ramesh (Sagar)")
    const custDsm = await getOrCreateCustomerForRestaurant(dsmId, CUSTOMER_PHONE, "Ramesh (Dsmaundar)")

    if (custSagar.id !== custDsm.id && custSagar.restaurant_id === sagarId && custDsm.restaurant_id === dsmId) {
      console.log(`✓ PASS: Created 2 distinct Customer records for same phone number:`)
      console.log(`  - Customer 1: ID=${custSagar.id}, restaurant_id=${custSagar.restaurant_id}`)
      console.log(`  - Customer 2: ID=${custDsm.id}, restaurant_id=${custDsm.restaurant_id}\n`)
    } else {
      throw new Error("TEST F FAILED: Customer records were shared or collided across restaurants!")
    }

    console.log("=========================================")
    console.log("ALL MULTI-TENANT ISOLATION TESTS PASSED 100%")
    console.log("=========================================")

  } finally {
    // Cleanup test data
    console.log("\nCleaning up test data...")
    await prisma.restaurant.deleteMany({
      where: {
        slug: { in: ["sagar-hotel-test", "dsmaundar-hotel-test"] }
      }
    })
    console.log("✓ Cleanup finished.")
  }
}
