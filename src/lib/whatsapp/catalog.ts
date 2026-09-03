import prisma from "@/lib/prisma"

export interface MetaCatalogProductPayload {
  retailer_id: string
  name: string
  description?: string
  availability: "in stock" | "out of stock"
  condition: "new"
  price: number // Meta expects integer cents
  currency: "INR"
  url?: string
  image_url?: string
  brand?: string
  category?: string
}

/**
 * Service to manage Meta Commerce Catalog synchronization.
 * Uses Graph API endpoints:
 * - Batch product sync / upsert: POST /{catalog_id}/batch
 * - Product listing/verification: GET  /{catalog_id}/products (paginated scan)
 * - Product deletion:             POST /{catalog_id}/batch  (method: "DELETE")
 */

export const GRAPH_API_VERSION =
  process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0"

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Scans ALL products in the Meta Catalogue (paginating through every page)
 * looking for a product whose retailer_id matches the given value.
 *
 * Why paginated scan instead of a filter query:
 * The /{catalog_id}/products edge does NOT support arbitrary JSON filter
 * parameters in a reliable, documented way. Using a filter that silently
 * returns an empty array gives false "not found" results. Paginated scan
 * is slower but guaranteed accurate.
 *
 * Returns { found: true, metaProductId } when confirmed present.
 * Never logs the access token.
 */
async function scanCatalogForProduct(
  catalogId: string,
  retailerId: string,
  token: string
): Promise<{ found: boolean; metaProductId?: string }> {
  let nextUrl: string | null =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/products?fields=id,retailer_id,name&limit=250`

  let pageCount = 0
  const MAX_PAGES = 40 // Safety cap: 40 × 250 = 10 000 products

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount++

    let res: Response
    let data: any

    try {
      res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      data = await res.json()
    } catch (networkErr: any) {
      console.error(
        `[Meta Catalog Scan] Network error on page ${pageCount} for catalog ${catalogId}:`,
        networkErr?.message
      )
      return { found: false }
    }

    if (!res.ok) {
      console.error(
        `[Meta Catalog Scan] HTTP ${res.status} on page ${pageCount} for catalog ${catalogId}:`,
        data?.error?.message || data
      )
      return { found: false }
    }

    const products: any[] = data?.data ?? []

    // Search this page for the retailer_id
    const match = products.find((p: any) => p.retailer_id === retailerId)
    if (match) {
      return { found: true, metaProductId: match.id }
    }

    // Advance to next page, or stop
    nextUrl = data?.paging?.next ?? null
  }

  return { found: false }
}

/**
 * Checks whether a product with `retailerId` currently exists in the Meta
 * Catalogue. Used both for CREATE-vs-UPDATE decision and post-sync verification.
 *
 * Logs [Meta Catalog Verification] lines but NEVER the token.
 */
async function checkProductExistsInMeta(
  catalogId: string,
  retailerId: string,
  itemName: string
): Promise<{ exists: boolean; metaProductId?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    return { exists: false, error: "Missing access token" }
  }

  console.log(
    `[Meta Catalog Verification] Scanning catalog ${catalogId} for '${itemName}' (retailer_id: ${retailerId})`
  )

  const result = await scanCatalogForProduct(catalogId, retailerId, token)

  if (result.found) {
    console.log(
      `[Meta Catalog Verification] FOUND '${itemName}' (retailer_id: ${retailerId}) in catalog ${catalogId} — Meta product id: ${result.metaProductId}`
    )
    return { exists: true, metaProductId: result.metaProductId }
  }

  console.warn(
    `[Meta Catalog Verification] NOT FOUND '${itemName}' (retailer_id: ${retailerId}) in catalog ${catalogId}`
  )
  return {
    exists: false,
    error: `Product '${retailerId}' not found in Meta Catalogue after paginated scan`,
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
    `[Meta Catalog Delete] Deleting '${itemName}' (retailer_id: ${retailerId}) from catalog ${catalogId}`
  )

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`
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

    // Log the sanitized batch response for debugging (no token)
    console.log(
      `[Meta Catalog Batch Response] DELETE '${itemName}' (retailer_id: ${retailerId}) catalog: ${catalogId} HTTP: ${res.status} handles: ${JSON.stringify(data?.handles)} validation_status: ${JSON.stringify(data?.validation_status)}`
    )

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      console.error(
        `[Meta Catalog Delete] HTTP error for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
      )
      return { success: false, error: errMsg }
    }

    // Inspect per-item result inside the batch response body.
    // The /batch endpoint returns HTTP 200 even for per-item failures.
    const handles: any[] = data?.handles ?? []
    const validationStatus: any[] = data?.validation_status ?? []

    // Check validation_status array for errors
    for (const vs of validationStatus) {
      if (vs?.errors && vs.errors.length > 0) {
        const errMsg = vs.errors.map((e: any) => e?.message || JSON.stringify(e)).join("; ")
        const isNotFound =
          errMsg.toLowerCase().includes("does not exist") ||
          errMsg.toLowerCase().includes("not found") ||
          errMsg.toLowerCase().includes("invalid id")
        if (isNotFound) {
          console.log(
            `[Meta Catalog Delete] '${itemName}' (retailer_id: ${retailerId}) already absent — treating as success`
          )
          return { success: true }
        }
        console.error(
          `[Meta Catalog Delete] Validation error for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
        )
        return { success: false, error: errMsg }
      }
    }

    // Older response format: handles[] with embedded error objects
    if (handles.length > 0 && handles[0]?.error) {
      const batchErr = handles[0].error
      const errCode: number = batchErr?.code ?? 0
      const errMsg: string =
        batchErr?.error_user_msg || batchErr?.message || JSON.stringify(batchErr)

      const isNotFound =
        errCode === 100 ||
        errMsg.toLowerCase().includes("does not exist") ||
        errMsg.toLowerCase().includes("not found")

      if (isNotFound) {
        console.log(
          `[Meta Catalog Delete] '${itemName}' (retailer_id: ${retailerId}) already absent — treating as success`
        )
        return { success: true }
      }

      console.error(
        `[Meta Catalog Delete] Batch operation error for '${itemName}' (retailer_id: ${retailerId}): ${errMsg}`
      )
      return { success: false, error: errMsg }
    }

    console.log(
      `[Meta Catalog Delete] Batch accepted for '${itemName}' (retailer_id: ${retailerId}). Verifying removal...`
    )

    // Verify the product is actually gone
    const stillExists = await checkProductExistsInMeta(catalogId, retailerId, itemName)
    if (stillExists.exists) {
      const errMsg = `Product '${retailerId}' still present in catalog after DELETE batch`
      console.error(`[Meta Catalog Delete] ${errMsg}`)
      return { success: false, error: errMsg }
    }

    console.log(
      `[Meta Catalog Delete] Confirmed: '${itemName}' (retailer_id: ${retailerId}) removed from catalog ${catalogId}`
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
 * Flow:
 * 1. Assign stable retailer_id = item.meta_product_sku || item.id (never changes).
 * 2. Query Meta to determine if the product ACTUALLY exists there (not from DB).
 * 3. Send CREATE (if absent) or UPDATE (if present) via batch endpoint.
 * 4. Inspect the full batch response for errors — HTTP 200 is NOT success alone.
 * 5. Verify product actually exists via paginated scan (no filter — reliable).
 * 6. Only mark SYNCED after verification passes. Otherwise mark FAILED.
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

    // Stable retailer_id — assigned once and never changed
    const retailerId: string = item.meta_product_sku || item.id

    // Persist the stable retailer_id immediately if not already set
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

    // -----------------------------------------------------------------------
    // Step 1: Determine CREATE vs UPDATE by querying Meta directly.
    // Do NOT rely on DB meta_product_sku alone — a previous failed sync may
    // have persisted the sku without actually creating the product in Meta.
    // -----------------------------------------------------------------------
    const existenceCheck = await checkProductExistsInMeta(catalogId, retailerId, item.name)
    const batchMethod: "CREATE" | "UPDATE" = existenceCheck.exists ? "UPDATE" : "CREATE"

    // Fallback image if item image is missing or not an absolute URL
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
      price: Math.round(item.price * 100),
      currency: "INR",
      url: `https://wa.me/${item.restaurant.whatsapp_phone_number_id || ""}`,
      brand: item.restaurant.name,
      image_url: publicImageUrl,
      category: item.category?.name || "Food & Beverages",
    }

    console.log(
      `[Meta Catalog Sync] ${batchMethod} '${item.name}' (retailer_id: ${retailerId}, restaurant: ${item.restaurant.name}, catalog: ${catalogId})`
    )

    // -----------------------------------------------------------------------
    // Step 2: Send batch request
    // -----------------------------------------------------------------------
    const batchUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${catalogId}/batch`
    let batchData: any

    try {
      const batchRes = await fetch(batchUrl, {
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

      batchData = await batchRes.json()

      // Log sanitized batch response (no token, no URL with token)
      console.log(
        `[Meta Catalog Batch Response] ${batchMethod} '${item.name}' (retailer_id: ${retailerId}) catalog: ${catalogId} HTTP: ${batchRes.status} | handles: ${JSON.stringify(batchData?.handles)} | validation_status: ${JSON.stringify(batchData?.validation_status)} | error: ${JSON.stringify(batchData?.error)}`
      )

      if (!batchRes.ok) {
        const errMsg = batchData?.error?.message || `HTTP ${batchRes.status}`
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
    // Step 3: Inspect per-item errors in the batch response body.
    // Meta returns HTTP 200 for the batch even when individual items fail.
    // Check both validation_status[] (newer format) and handles[] (older format).
    // -----------------------------------------------------------------------

    // Check validation_status array (newer Meta batch response format)
    const validationStatus: any[] = batchData?.validation_status ?? []
    for (const vs of validationStatus) {
      if (vs?.errors && vs.errors.length > 0) {
        const errMsg = vs.errors
          .map((e: any) => e?.summary || e?.message || JSON.stringify(e))
          .join("; ")
        console.error(
          `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}, catalog: ${catalogId}) validation_status error: ${errMsg}`
        )
        await prisma.menuItem.update({
          where: { id: menuItemId },
          data: {
            meta_product_sku: retailerId,
            meta_sync_status: "FAILED",
            meta_sync_error: `Batch validation error: ${errMsg}`,
          },
        })
        return { success: false, error: errMsg }
      }
    }

    // Check handles[] for embedded errors (older format)
    const handles: any[] = batchData?.handles ?? []
    if (handles.length > 0 && handles[0]?.error) {
      const batchErr = handles[0].error
      const errMsg: string =
        batchErr?.error_user_msg ||
        batchErr?.message ||
        JSON.stringify(batchErr)
      console.error(
        `[Meta Catalog Sync Failed] '${item.name}' (retailer_id: ${retailerId}, catalog: ${catalogId}) handles error: ${errMsg}`
      )
      await prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          meta_product_sku: retailerId,
          meta_sync_status: "FAILED",
          meta_sync_error: `Batch handles error: ${errMsg}`,
        },
      })
      return { success: false, error: errMsg }
    }

    // -----------------------------------------------------------------------
    // Step 4: Verify product actually exists in Meta Catalogue.
    // Paginated scan — no unreliable filter syntax.
    // -----------------------------------------------------------------------
    console.log(
      `[Meta Catalog Verification] Verifying '${item.name}' (retailer_id: ${retailerId}) in catalog ${catalogId} after ${batchMethod}...`
    )

    const verification = await checkProductExistsInMeta(catalogId, retailerId, item.name)

    if (!verification.exists) {
      const errMsg =
        verification.error ||
        `Product '${retailerId}' not found in Meta Catalogue after ${batchMethod}`
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
    // Step 5: Only now mark as SYNCED
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
      `[Meta Catalog Sync Success] '${item.name}' (retailer_id: ${retailerId}, restaurant: ${item.restaurant.name}, catalog: ${catalogId}) verified SYNCED via ${batchMethod}`
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
      // Swallow — item may not exist
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
 * - For each item: queries Meta for existence, syncs, verifies.
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
