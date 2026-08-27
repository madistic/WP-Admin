import prisma from "@/lib/prisma"
import { getRestaurantByWhatsAppPhoneNumberId } from "./restaurant"

export async function runTenantMappingTest() {
  console.log("=========================================")
  console.log("STARTING REAL META PHONE NUMBER ID MAPPING TEST")
  console.log("=========================================\n")

  const REAL_META_PHONE_ID = "1263577343514381"
  const SAMPLE_PHONE_ID = "123456123"
  const TARGET_RESTAURANT_ID = "cd1feb68-b245-47e7-a92c-6de02f3fbbb9"

  try {
    // 1. Verify Real Meta Phone Number ID resolution
    console.log(`TEST 1: Resolving real Meta test phone_number_id '${REAL_META_PHONE_ID}'...`)
    const resolvedResto = await getRestaurantByWhatsAppPhoneNumberId(REAL_META_PHONE_ID)

    if (resolvedResto && resolvedResto.id === TARGET_RESTAURANT_ID) {
      console.log(`✓ PASS: Resolved to target restaurant '${resolvedResto.name}' (ID: ${resolvedResto.id})\n`)
    } else {
      throw new Error(`TEST 1 FAILED: Expected restaurant ID '${TARGET_RESTAURANT_ID}', got '${resolvedResto?.id}'`)
    }

    // 2. Verify Sample Phone Number ID rejection
    console.log(`TEST 2: Attempting lookup for unmapped sample ID '${SAMPLE_PHONE_ID}'...`)
    const sampleLookup = await getRestaurantByWhatsAppPhoneNumberId(SAMPLE_PHONE_ID)

    if (sampleLookup === null) {
      console.log(`✓ PASS: Sample ID '${SAMPLE_PHONE_ID}' strictly rejected (returns null)\n`)
    } else {
      throw new Error(`TEST 2 FAILED: Sample ID '${SAMPLE_PHONE_ID}' should not resolve to any restaurant!`)
    }

    console.log("=========================================")
    console.log("ALL TENANT MAPPING TESTS PASSED 100%")
    console.log("=========================================")
  } catch (err: any) {
    console.error("TEST SUITE FAILED:", err.message)
    throw err
  }
}
