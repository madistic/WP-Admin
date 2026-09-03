import prisma from "@/lib/prisma"

export interface MetaCatalogProductPayload {
  retailer_id: string
  name: string
  description?: string
  availability: "in stock" | "out of stock"
  condition: "new"
  price: string // e.g. "280.00 INR"
  currency: string
  link?: string
  image_url?: string
  brand?: string
  category?: string
}

/**
 * Service to manage Meta Commerce Catalog synchronization.
 * Uses Graph API endpoints:
 * - Batch product sync / upsert: POST /{catalog_id}/batch
 * - Product verification:        GET  /{catalog_id}/products?filter=retailer_id=={sku}
 * - Product deletion:            POST /{catalog_id}/batch  (method: "DELETE")
 */

export const GRAPH_API_VERSION =
  process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0"

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Returns a safe base URL for the catalog batch endpoint.
 * NEVER includes the access token in the string.
 */
function catalogBatchUrl(catalogId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`
}

/**
 * Verifies that a product with the given retailer_id actually exists in the
 * Meta Catalogue by querying the products edge with a retailer_id filter.
 *
 * Returns { exists: true } only when Meta confirms the product is present.
 */
async function verifyProductInMetaCatalog(
  catalogId: string,
  retailerId: string,
  itemName: string
): Promise<{ exists: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    return { exists: false, error: "Missing access token" }
  }

  // Use filter param supported by Meta Graph API:
  // GET /{catalog-id}/products?filter={"retailer_id":{"eq":"<sku>"}}&fields=id,name,retailer_id
  const filterParam = encodeURIComponent(
    JSON.stringify({ retailer_id: { eq: retailerId } })
  )
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/products?filter=${filterParam}&fields=id,name,retailer_id&limit=1`

  console.log(
    `[Meta Catalog Verification] Checking product '${itemName}' (retailer_id: ${retailerId}) in catalog ${catalogId}`
  )

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      console.error(
        `[Meta Catalog Verification] Failed for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
      )
      return { exists: false, error: errMsg }
    }

    const products: any[] = data?.data ?? []
    if (products.length > 0) {
      console.log(
        `[Meta Catalog Verification] Confirmed: '${itemName}' (retailer_id: ${retailerId}) EXISTS in catalog ${catalogId}`
      )
      return { exists: true }
    }

    console.warn(
      `[Meta Catalog Verification] NOT FOUND: '${itemName}' (retailer_id: ${retailerId}) not present in catalog ${catalogId}`
    )
    return {
      exists: false,
      error: `Product retailer_id '${retailerId}' not found in Meta Catalogue after sync`,
    }
  } catch (err: any) {
    console.error(
      `[Meta Catalog Verification] Exception for '${itemName}' (retailer_id: ${retailerId}):`,
      err?.message || err
    )
    return { exists: false, error: err?.message || "Network exception during verification" }
  }
}

// ---------------------------------------------------------------------------
// EXPORTED HELPERS
// ---------------------------------------------------------------------------

/**
 * Preflight check to verify if the catalog ID is accessible with the current
 * access token.
 *
 * Does NOT log the token or Authorization header.
 */
export async function checkCatalogAccess(
  catalogId: string
): Promise<{ accessible: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!catalogId || !token) {
    return { accessible: false, error: "Missing catalog ID or access token" }
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}?fields=id,name`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(
        `[Meta Catalog Check Error] Catalog '${catalogId}' check failed (HTTP ${res.status}):`,
        data?.error?.message || data
      )
      return {
        accessible: false,
        error: data?.error?.message || `HTTP ${res.status}`,
      }
    }
    console.log(
      `[Meta Catalog Check] Catalog '${catalogId}' (name: ${data?.name}) is accessible.`
    )
    return { accessible: true }
  } catch (err: any) {
    console.error(
      `[Meta Catalog Check Exception] Catalog '${catalogId}' check failed:`,
      err?.message || err
    )
    return { accessible: false, error: err?.message || "Unknown error" }
  }
}

/**
 * Deletes a product from the Meta Catalogue using the batch endpoint.
 *
 * - If Meta confirms deletion → returns { success: true }.
 * - If Meta says the product does not exist → treated as idempotent success.
 * - On any other failure → returns { success: false, error }.
 *
 * The DB record is NOT touched here; the caller decides what to do.
 */
export async function deleteProductFromMetaCatalog(
  catalogId: string,
  retailerId: string,
  itemName: string
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    return { success: false, error: "Missing access token" }
  }
  if (!catalogId) {
    return { success: false, error: "Missing catalog ID" }
  }

  console.log(
    `[Meta Catalog Delete] Deleting product '${itemName}' (retailer_id: ${retailerId}) from catalog ${catalogId}`
  )

  const url = catalogBatchUrl(catalogId)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            method: "DELETE",
            retailer_id: retailerId,
          },
        ],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      console.error(
        `[Meta Catalog Delete] HTTP error for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
      )
      return { success: false, error: errMsg }
    }

    // Inspect per-item result inside the batch response
    const handles: any[] = data?.handles ?? []
    if (handles.length > 0 && handles[0]?.error) {
      const batchErr = handles[0].error
      const errCode: number = batchErr?.code ?? 0
      const errMsg: string = batchErr?.error_user_msg || batchErr?.message || JSON.stringify(batchErr)

      // Product-not-found codes — treat as idempotent success
      // Meta error code 100 with subcode 33 or message containing "does not exist"
      const isNotFound =
        errCode === 100 ||
        errMsg.toLowerCase().includes("does not exist") ||
        errMsg.toLowerCase().includes("not found")

      if (isNotFound) {
        console.log(
          `[Meta Catalog Delete] Product '${itemName}' (retailer_id: ${retailerId}) already absent from catalog ${catalogId} — treating as success`
        )
        return { success: true }
      }

      console.error(
        `[Meta Catalog Delete] Batch operation error for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
      )
      return { success: false, error: errMsg }
    }

    console.log(
      `[Meta Catalog Delete] Successfully deleted '${itemName}' (retailer_id: ${retailerId}) from catalog ${catalogId}`
    )
    return { success: true }
  } catch (err: any) {
    console.error(
      `[Meta Catalog Delete] Exception for '${itemName}' (retailer_id: ${retailerId}):`,
      err?.message || err
    )
    return { success: false, error: err?.message || "Network exception during delete" }
  }
}

// ---------------------------------------------------------------------------
// MAIN SYNC FUNCTION
// ---------------------------------------------------------------------------

/**
 * Syncs a single MenuItem with the restaurant's Meta Commerce Catalog.
 *
 * Behavior:
 * - If `meta_product_sku` is null  → uses item.id as the stable retailer_id and sends CREATE.
 * - If `meta_product_sku` is set   → reuses it and sends UPDATE.
 * - Inspects the Meta batch response for per-item errors (HTTP 200 is NOT treated as success).
 * - After a clean batch response, verifies the product actually exists via GET.
 * - Only marks SYNCED after verification succeeds.
 * - On any failure marks FAILED with a descriptive error.
 *
 * Token is NEVER logged.
 */
export async function syncMenuItemToMetaCatalog(
  menuItemId: string
): Promise<{ success: boolean; error?: string }> {
  let item: any

  try {
    item = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { restaurant: true, category: true },
    })

    if (!item) {
      return { success: false, error: "MenuItem not found" }
    }

    const catalogId =
      item.restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
    const token = process.env.WHATSAPP_ACCESS_TOKEN

    // Stable retailer_id: reuse existing meta_product_sku, fall back to item.id
    const retailerId: string = item.meta_product_sku || item.id

    // Always persist the stable retailer_id immediately so subsequent calls reuse it
    if (!item.meta_product_sku) {
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: { meta_product_sku: retailerId },
      })
    }

    if (!catalogId || !token) {
      const reason = !catalogId
        ? "Missing catalog ID"
        : "Missing Meta access token"
      console.warn(
        `[Meta Catalog Sync] '${item.name}' (retailer_id: ${retailerId}, restaurant: ${item.restaurant.name}) NOT_CONFIGURED: ${reason}`
      )
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_product_sku: retailerId,
          meta_sync_status: "NOT_CONFIGURED",
          meta_sync_error: reason,
        },
      })
      return { success: false, error: reason }
    }

    // Determine CREATE vs UPDATE
    // If the DB had no meta_product_sku before this call, this is a CREATE.
    // If it already had one, this is an UPDATE.
    const batchMethod: "CREATE" | "UPDATE" = item.meta_product_sku
      ? "UPDATE"
      : "CREATE"

    // Fallback image if item image is missing or relative
    const publicImageUrl =
      item.image_url && item.image_url.startsWith("http")
        ? item.image_url
        : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop"

    const isAvailable = item.is_available && item.is_active

    const productPayload: MetaCatalogProductPayload = {
      retailer_id: retailerId,
      name: item.name,
      description: item.description || item.name,
      availability: isAvailable ? "in stock" : "out of stock",
      condition: "new",
      price: `${item.price.toFixed(2)} INR`,
      currency: "INR",
      image_url: publicImageUrl,
      category: item.category?.name || "Food & Beverages",
    }

    console.log(
      `[Meta Catalog Sync] ${batchMethod} '${item.name}' (retailer_id: ${retailerId}, restaurant: ${item.restaurant.name}, catalog: ${catalogId})`
    )

    // -----------------------------------------------------------------------
    // Step 1: Send batch request
    // -----------------------------------------------------------------------
    const url = catalogBatchUrl(catalogId)
    let batchData: any

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              method: batchMethod,
              retailer_id: retailerId,
              data: productPayload,
            },
          ],
        }),
      })

      batchData = await res.json()

      if (!res.ok) {
        const errMsg =
          batchData?.error?.message || `HTTP ${res.status}`
        console.error(
          `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}, catalog: ${catalogId}) HTTP error: ${errMsg}`
        )
        await prisma.menuItem.update({
          where: { id: menuItemId },
          data: {
            meta_product_sku: retailerId,
            meta_sync_status: "FAILED",
            meta_sync_error: `Batch HTTP error: ${errMsg}`,
          },
        })
        return { success: false, error: errMsg }
      }
    } catch (fetchErr: any) {
      const errMsg = fetchErr?.message || "Network exception during batch"
      console.error(
        `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}) network exception:`,
        errMsg
      )
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_product_sku: retailerId,
          meta_sync_status: "FAILED",
          meta_sync_error: errMsg,
        },
      })
      return { success: false, error: errMsg }
    }

    // -----------------------------------------------------------------------
    // Step 2: Inspect per-item error inside the batch response body
    // HTTP 200 from /batch does NOT mean each item succeeded.
    // -----------------------------------------------------------------------
    const handles: any[] = batchData?.handles ?? []

    if (handles.length > 0 && handles[0]?.error) {
      const batchErr = handles[0].error
      const errMsg: string =
        batchErr?.error_user_msg ||
        batchErr?.message ||
        JSON.stringify(batchErr)

      console.error(
        `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}, catalog: ${catalogId}) batch per-item error: ${errMsg}`
      )
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_product_sku: retailerId,
          meta_sync_status: "FAILED",
          meta_sync_error: `Batch per-item error: ${errMsg}`,
        },
      })
      return { success: false, error: errMsg }
    }

    // -----------------------------------------------------------------------
    // Step 3: Verify product actually exists in Meta Catalogue
    // Never mark SYNCED based on HTTP 200 alone.
    // -----------------------------------------------------------------------
    const verification = await verifyProductInMetaCatalog(
      catalogId,
      retailerId,
      item.name
    )

    if (!verification.exists) {
      const errMsg =
        verification.error || "Verification failed: product not found in Meta Catalogue"
      console.error(
        `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}, catalog: ${catalogId}) verification failed: ${errMsg}`
      )
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_product_sku: retailerId,
          meta_sync_status: "FAILED",
          meta_sync_error: errMsg,
        },
      })
      return { success: false, error: errMsg }
    }

    // -----------------------------------------------------------------------
    // Step 4: Only now mark as SYNCED
    // -----------------------------------------------------------------------
    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        meta_product_sku: retailerId,
        meta_sync_status: "SYNCED",
        meta_sync_error: null,
        meta_synced_at: new Date(),
      },
    })

    console.log(
      `[Meta Catalog Sync Success] '${item.name}' (retailer_id: ${retailerId}, restaurant: ${item.restaurant.name}, catalog: ${catalogId}) verified and marked SYNCED`
    )
    return { success: true }
  } catch (error: any) {
    const errMsg = error?.message || "Unknown exception"
    console.error(`[Meta Catalog Sync Failed] Exception:`, errMsg)

    // Attempt to mark the item FAILED if we have its ID
    try {
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_sync_status: "FAILED",
          meta_sync_error: errMsg,
        },
      })
    } catch {
      // Swallow — the item may not exist
    }

    return { success: false, error: errMsg }
  }
}

// ---------------------------------------------------------------------------
// BULK RESTAURANT SYNC
// ---------------------------------------------------------------------------

/**
 * Synchronizes all menu items for a specific restaurant catalog.
 *
 * - Checks catalog access first.
 * - For each item: syncs, inspects Meta response, verifies existence.
 * - Counts only truly SYNCED (verified) items.
 * - Returns { total, synced, failed }.
 */
export async function syncRestaurantCatalog(
  restaurantId: string
): Promise<{ total: number; synced: number; failed: number }> {
  const items = await prisma.menuItem.findMany({
    where: { restaurant_id: restaurantId },
    include: { restaurant: true },
  })

  if (items.length === 0) return { total: 0, synced: 0, failed: 0 }

  const catalogId =
    items[0].restaurant.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID

  if (catalogId) {
    const check = await checkCatalogAccess(catalogId)
    if (!check.accessible) {
      console.error(
        `[Meta Catalog Sync Aborted] Catalog '${catalogId}' is not accessible for restaurant '${items[0].restaurant.name}': ${check.error}`
      )
      return { total: items.length, synced: 0, failed: items.length }
    }
  }

  let synced = 0
  let failed = 0

  for (const item of items) {
    const result = await syncMenuItemToMetaCatalog(item.id)
    if (result.success) {
      synced++
    } else {
      failed++
    }
  }

  console.log(
    `[Meta Catalog Sync] Restaurant '${items[0].restaurant.name}' bulk sync complete: total=${items.length}, synced=${synced}, failed=${failed}`
  )

  return { total: items.length, synced, failed }
}
