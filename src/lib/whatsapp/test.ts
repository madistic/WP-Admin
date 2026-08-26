import { getRestaurantMenu, getMenuItems, searchMenuItems } from "./menu"
import { getWhatsAppCategories, getWhatsAppItems, formatWhatsAppProductDetailText } from "./adapter"

/**
 * Verification test suite for Reusable Menu Service & WhatsApp Adapter.
 */
export async function runWhatsAppMenuTests(testRestaurantId: string) {
  console.log(`[TEST SUITE] Starting WhatsApp Menu Service tests for restaurant: ${testRestaurantId}`)
  const results: { test: string; passed: boolean; details?: Record<string, unknown>; error?: string }[] = []

  // Test 1: Restaurant Menu Retrieval
  try {
    const menu = await getRestaurantMenu(testRestaurantId)
    results.push({
      test: "Test 1 — Restaurant Menu Retrieval",
      passed: Array.isArray(menu.categories) && Array.isArray(menu.items),
      details: { categoriesCount: menu.categories.length, itemsCount: menu.items.length },
    })
  } catch (err: unknown) {
    results.push({ test: "Test 1 — Restaurant Menu Retrieval", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 2: Restaurant Isolation
  try {
    const fakeRestaurantId = "00000000-0000-0000-0000-000000000000"
    const menu = await getRestaurantMenu(fakeRestaurantId)
    results.push({
      test: "Test 2 — Restaurant Isolation (Invalid Restaurant)",
      passed: menu.categories.length === 0 && menu.items.length === 0,
      details: { categoriesCount: menu.categories.length, itemsCount: menu.items.length },
    })
  } catch (err: unknown) {
    results.push({ test: "Test 2 — Restaurant Isolation", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 3 & 4 & 5: Active / Available Filtering
  try {
    const items = await getMenuItems(testRestaurantId)
    const allOrderable = items.every(
      (item) => item.is_active && item.is_available && item.category?.id
    )
    results.push({
      test: "Test 3, 4, 5 — Active & Available Item / Category Filtering",
      passed: allOrderable,
      details: { fetchedItemsCount: items.length },
    })
  } catch (err: unknown) {
    results.push({ test: "Test 3, 4, 5 — Active Filtering", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 6 & 7: Variants filtering
  try {
    const items = await getMenuItems(testRestaurantId)
    const hasOnlyAvailableVariants = items.every((item) =>
      item.variants.every((v) => v.is_available)
    )
    results.push({
      test: "Test 6, 7 — Available Variants Only",
      passed: hasOnlyAvailableVariants,
    })
  } catch (err: unknown) {
    results.push({ test: "Test 6, 7 — Variants Filtering", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 8: Add-ons filtering
  try {
    const items = await getMenuItems(testRestaurantId)
    const hasOnlyAvailableAddons = items.every((item) =>
      item.addons.every((a) => a.is_available)
    )
    results.push({
      test: "Test 8 — Available Add-ons Only",
      passed: hasOnlyAvailableAddons,
    })
  } catch (err: unknown) {
    results.push({ test: "Test 8 — Addons Filtering", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 9 & 10 & 11: Search Queries
  try {
    const searchResult = await searchMenuItems(testRestaurantId, "biryani")
    const emptySearchResult = await searchMenuItems(testRestaurantId, "")
    const nonExistentResult = await searchMenuItems(testRestaurantId, "xyzabc123nonexistent")

    results.push({
      test: "Test 9, 10, 11 — Search Functionality & Safety",
      passed:
        Array.isArray(searchResult) &&
        emptySearchResult.length === 0 &&
        nonExistentResult.length === 0,
      details: {
        biryaniMatchCount: searchResult.length,
        emptyMatchCount: emptySearchResult.length,
        nonExistentMatchCount: nonExistentResult.length,
      },
    })
  } catch (err: unknown) {
    results.push({ test: "Test 9, 10, 11 — Search Functionality", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  // Test 12: WhatsApp Adapter Formatting
  try {
    const waCategories = await getWhatsAppCategories(testRestaurantId)
    const waItems = await getWhatsAppItems(testRestaurantId)
    let formattedText = ""
    if (waItems.length > 0) {
      formattedText = formatWhatsAppProductDetailText(waItems[0])
    }

    results.push({
      test: "Test 12 — WhatsApp Adapter Formatting",
      passed: Array.isArray(waCategories) && Array.isArray(waItems) && (waItems.length === 0 || formattedText.length > 0),
      details: { waCategoriesCount: waCategories.length, waItemsCount: waItems.length },
    })
  } catch (err: unknown) {
    results.push({ test: "Test 12 — WhatsApp Adapter Formatting", passed: false, error: err instanceof Error ? err.message : String(err) })
  }

  console.log(`[TEST SUITE] Completed. ${results.filter((r) => r.passed).length}/${results.length} tests passed.`)
  return results
}

