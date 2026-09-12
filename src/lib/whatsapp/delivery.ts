import prisma from "@/lib/prisma"
import { OrderType } from "@prisma/client"

export const PROVISIONAL_DISTANCE_KM = 2.0

export interface BranchDeliverySettings {
  id: string
  restaurant_id: string
  latitude: number | null
  longitude: number | null
  delivery_enabled: boolean
  delivery_free_distance_km: number
  delivery_extra_charge_per_km: number
  delivery_charge_rounding: string
  delivery_max_distance_km: number | null
}

export interface DeliveryQuoteResult {
  ok: boolean
  error?: string
  branchId?: string
  deliveryDistanceKm?: number
  deliveryCharge?: number
  freeDeliveryDistanceKm?: number
  deliveryChargePerKm?: number
  /** true when routing API was unavailable and 2 km provisional distance was used */
  isProvisional?: boolean
  address?: {
    id: string
    address_line: string
    normalized_address: string | null
    latitude: number | null
    longitude: number | null
    calculated_distance_km: number | null
    distance_calculated_at: Date | null
    distance_source: string | null
    geocoding_provider: string | null
    geocoding_metadata: string | null
  } | null
}

// ─────────────────────────────────────────────
// Exact Road Distance via Google Routes API
// Compute Route Matrix for multiple branches
// ─────────────────────────────────────────────
async function computeRouteMatrixDistances(
  customerLat: number,
  customerLng: number,
  branches: BranchDeliverySettings[]
): Promise<(number | null)[]> {
  const apiKey = process.env.DISTANCE_API_KEY
  if (!apiKey) {
    console.error("[Delivery] DISTANCE_API_KEY is not set.")
    return branches.map(() => null)
  }

  const url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
  
  const payload = {
    origins: [
      {
        waypoint: { location: { latLng: { latitude: customerLat, longitude: customerLng } } }
      }
    ],
    destinations: branches.map(b => ({
      waypoint: { location: { latLng: { latitude: b.latitude, longitude: b.longitude } } }
    })),
    travelMode: "DRIVE"
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,status"
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      console.error(`[Delivery] Routes API returned ${res.status}:`, await res.text())
      return branches.map(() => null)
    }

    const data = await res.json()
    const results: (number | null)[] = new Array(branches.length).fill(null)
    
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.originIndex === 0 && item.destinationIndex !== undefined && item.distanceMeters !== undefined) {
           results[item.destinationIndex] = Number((item.distanceMeters / 1000).toFixed(2))
        }
      }
    }
    return results
  } catch (error) {
     console.error("[Delivery] Routes API Error", error)
     return branches.map(() => null)
  }
}

// ─────────────────────────────────────────────
// Delivery Charge Calculation (PER_STARTED_KM)
// ─────────────────────────────────────────────
export function calculateDeliveryCharge(
  distanceKm: number,
  settings: Pick<BranchDeliverySettings, "delivery_free_distance_km" | "delivery_extra_charge_per_km" | "delivery_charge_rounding">
): { deliveryCharge: number; extraDistanceKm: number } {
  if (distanceKm <= 0) {
    return { deliveryCharge: 0, extraDistanceKm: 0 }
  }

  const freeDistance = settings.delivery_free_distance_km || 0

  if (distanceKm <= freeDistance) {
    return { deliveryCharge: 0, extraDistanceKm: 0 }
  }

  const extraDistance = Math.max(distanceKm - freeDistance, 0)

  let extraDistanceUnits = 0
  if (settings.delivery_charge_rounding === "PER_FULL_KM") {
    extraDistanceUnits = Math.floor(extraDistance)
  } else {
    // PER_STARTED_KM (default)
    extraDistanceUnits = Math.ceil(extraDistance)
  }

  const deliveryCharge = Number((extraDistanceUnits * settings.delivery_extra_charge_per_km).toFixed(2))

  return { deliveryCharge, extraDistanceKm: extraDistanceUnits }
}

// ─────────────────────────────────────────────
// Text Normalization for address deduplication
// ─────────────────────────────────────────────
function normalizeAddressText(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim()
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null
  }
  return Number(value)
}

// ─────────────────────────────────────────────
// Get all active branches with locations for a restaurant
// ─────────────────────────────────────────────
export async function getActiveBranchesWithLocations(restaurantId: string): Promise<BranchDeliverySettings[]> {
  const branches = await prisma.branch.findMany({
    where: {
      restaurant_id: restaurantId,
      is_active: true,
      delivery_enabled: true,
      // Only branches with a valid location can serve deliveries
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      restaurant_id: true,
      latitude: true,
      longitude: true,
      delivery_enabled: true,
      delivery_free_distance_km: true,
      delivery_extra_charge_per_km: true,
      delivery_charge_rounding: true,
      delivery_max_distance_km: true,
    },
  })

  return branches as BranchDeliverySettings[]
}

// ─────────────────────────────────────────────
// Select nearest active branch to customer coordinates.
// When the routing API is unavailable, falls back to a PROVISIONAL 2 km
// distance so customers are never blocked by an API outage.
// ─────────────────────────────────────────────
export interface NearestBranchResult {
  branch: BranchDeliverySettings
  distanceKm: number
  deliveryCharge: number
  /** true = routing API failed; distance is provisional (2 km placeholder) */
  isProvisional: boolean
}

export async function selectNearestEligibleBranch(
  customerLat: number,
  customerLng: number,
  branches: BranchDeliverySettings[]
): Promise<NearestBranchResult | null> {
  const eligibleBranches = branches.filter(b => b.delivery_enabled && b.latitude && b.longitude)
  if (eligibleBranches.length === 0) return null

  const distances = await computeRouteMatrixDistances(customerLat, customerLng, eligibleBranches)

  // Check if ALL distances failed (API outage scenario)
  const allNull = distances.every(d => d === null)

  if (allNull) {
    // ── Routing API is completely unavailable ──
    // Use provisional distance so customers are not blocked.
    // Pick the first eligible branch (no way to rank without distances).
    console.warn(
      `[Delivery] Routes API unavailable for all ${eligibleBranches.length} branch(es). ` +
      `Falling back to provisional ${PROVISIONAL_DISTANCE_KM} km for branch ${eligibleBranches[0].id}.`
    )
    const branch = eligibleBranches[0]
    const { deliveryCharge } = calculateDeliveryCharge(PROVISIONAL_DISTANCE_KM, branch)
    return { branch, distanceKm: PROVISIONAL_DISTANCE_KM, deliveryCharge, isProvisional: true }
  }

  let best: NearestBranchResult | null = null

  for (let i = 0; i < eligibleBranches.length; i++) {
    const branch = eligibleBranches[i]
    const distanceKm = distances[i]

    if (distanceKm === null) {
      console.warn(`[Delivery] Could not calculate road distance for branch ${branch.id} — skipping.`)
      continue
    }

    // If branch has a max delivery distance, skip branches that are too far
    if (branch.delivery_max_distance_km !== null && branch.delivery_max_distance_km !== undefined) {
      if (distanceKm > branch.delivery_max_distance_km) continue
    }

    const { deliveryCharge } = calculateDeliveryCharge(distanceKm, branch)

    if (best === null || distanceKm < best.distanceKm) {
      best = { branch, distanceKm, deliveryCharge, isProvisional: false }
    }
  }

  // If exact distances were partially available but none were within range,
  // do NOT fall back to provisional — the customer genuinely may be out of range.
  return best
}

// ─────────────────────────────────────────────
// Geocode address using Google Geocoding or fallback
// ─────────────────────────────────────────────
async function geocodeAddress(address: string): Promise<{
  latitude: number
  longitude: number
  provider: string
  metadata: string
} | null> {
  const trimmedAddress = address.trim()
  if (!trimmedAddress) {
    return null
  }

  const apiKey = process.env.DISTANCE_API_KEY
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmedAddress)}&key=${apiKey}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.status === "OK" && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location
          return {
            latitude: loc.lat,
            longitude: loc.lng,
            provider: "GOOGLE_GEOCODING",
            metadata: JSON.stringify({ place_id: data.results[0].place_id, formatted_address: data.results[0].formatted_address })
          }
        }
      }
    } catch (e) {
      console.error("[WhatsApp Delivery] Google Geocoding failed:", e)
    }
  }

  // Fallback to nominatim
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(trimmedAddress)}&limit=1`,
      {
        headers: {
          "User-Agent": "RestPro-WhatsApp/1.0",
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as Array<{
      lat?: string
      lon?: string
      display_name?: string
      osm_id?: number
    }>

    const candidate = data[0]
    if (!candidate?.lat || !candidate?.lon) {
      return null
    }

    const latitude = toNumber(candidate.lat)
    const longitude = toNumber(candidate.lon)

    if (latitude === null || longitude === null) {
      return null
    }

    return {
      latitude,
      longitude,
      provider: "NOMINATIM",
      metadata: JSON.stringify({
        display_name: candidate.display_name || trimmedAddress,
        osm_id: candidate.osm_id || null,
      }),
    }
  } catch (error) {
    console.error("[WhatsApp Delivery] Nominatim Geocoding failed:", error)
    return null
  }
}

// ─────────────────────────────────────────────
// Resolve delivery quote for an address text (manual / text address)
// Performs nearest-branch selection server-side
// ─────────────────────────────────────────────
export async function resolveWhatsappDeliveryQuote(
  restaurantId: string,
  _branchIdIgnored: string, // kept for signature compat; we always re-select nearest branch
  customerPhone: string,
  deliveryAddress: string,
  orderType: OrderType,
  customerCoords?: { latitude: number; longitude: number } // for live-location orders
): Promise<DeliveryQuoteResult> {
  const cleanPhone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`

  if (orderType === OrderType.TAKEAWAY) {
    return {
      ok: true,
      branchId: _branchIdIgnored,
      deliveryDistanceKm: 0,
      deliveryCharge: 0,
      freeDeliveryDistanceKm: 0,
      deliveryChargePerKm: 0,
      isProvisional: false,
      address: null,
    }
  }

  const trimmedAddress = deliveryAddress.trim()
  if (!trimmedAddress) {
    return {
      ok: false,
      error: "Please provide a delivery address before confirming the order.",
    }
  }

  const normalizedAddress = normalizeAddressText(trimmedAddress)

  // ── Find or create customer ──
  let customer = await prisma.customer.findFirst({
    where: {
      restaurant_id: restaurantId,
      phone: cleanPhone,
    },
  })

  // ── Check for existing verified address (cache hit → skip API) ──
  if (customer) {
    const existingAddress = await prisma.customerAddress.findFirst({
      where: {
        restaurant_id: restaurantId,
        customer_id: customer.id,
        OR: [
          { normalized_address: normalizedAddress },
          { address_line: { equals: trimmedAddress, mode: "insensitive" } },
        ],
        // Must have coordinates
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { created_at: "desc" },
    })

    if (existingAddress && existingAddress.latitude && existingAddress.longitude) {
      const cachedSource = existingAddress.distance_source ?? "EXACT"

      // If cached distance is PROVISIONAL, attempt a fresh exact calculation
      if (cachedSource === "PROVISIONAL") {
        console.log(`[Delivery] Cached address ${existingAddress.id} has PROVISIONAL distance — retrying exact calculation.`)
        const branches = await getActiveBranchesWithLocations(restaurantId)
        if (branches.length > 0) {
          const nearest = await selectNearestEligibleBranch(existingAddress.latitude, existingAddress.longitude, branches)
          if (nearest && !nearest.isProvisional) {
            // Got an exact distance — update the cache
            console.log(`[Delivery] Upgraded PROVISIONAL → EXACT for address ${existingAddress.id}: ${nearest.distanceKm} km`)
            await prisma.customerAddress.update({
              where: { id: existingAddress.id },
              data: {
                calculated_distance_km: nearest.distanceKm,
                distance_calculated_at: new Date(),
                distance_source: "EXACT",
                branch_id: nearest.branch.id,
              },
            })
            return {
              ok: true,
              branchId: nearest.branch.id,
              deliveryDistanceKm: nearest.distanceKm,
              deliveryCharge: nearest.deliveryCharge,
              freeDeliveryDistanceKm: nearest.branch.delivery_free_distance_km,
              deliveryChargePerKm: nearest.branch.delivery_extra_charge_per_km,
              isProvisional: false,
              address: {
                id: existingAddress.id,
                address_line: existingAddress.address_line,
                normalized_address: existingAddress.normalized_address,
                latitude: existingAddress.latitude,
                longitude: existingAddress.longitude,
                calculated_distance_km: nearest.distanceKm,
                distance_calculated_at: new Date(),
                distance_source: "EXACT",
                geocoding_provider: existingAddress.geocoding_provider,
                geocoding_metadata: existingAddress.geocoding_metadata,
              },
            }
          }
          // API still down — continue serving provisional
        }
      }

      // Cache hit with EXACT (or still PROVISIONAL) — use saved data
      const branches = await getActiveBranchesWithLocations(restaurantId)
      if (branches.length === 0) {
        return { ok: false, error: "No active branches are available for delivery." }
      }

      const nearest = await selectNearestEligibleBranch(existingAddress.latitude, existingAddress.longitude, branches)
      if (!nearest) {
        return {
          ok: false,
          error: "Sorry, we don't deliver to your area. Please try a different address.",
        }
      }

      const distanceKm = nearest.distanceKm
      const newSource = nearest.isProvisional ? "PROVISIONAL" : "EXACT"

      // Update cache if distance or source changed
      if (existingAddress.calculated_distance_km !== distanceKm || cachedSource !== newSource) {
        await prisma.customerAddress.update({
          where: { id: existingAddress.id },
          data: {
            calculated_distance_km: distanceKm,
            distance_calculated_at: new Date(),
            distance_source: newSource,
            branch_id: nearest.branch.id,
          },
        })
      }

      console.log(`[Delivery] Address ${existingAddress.id} distance: ${distanceKm} km [${newSource}]`)

      return {
        ok: true,
        branchId: nearest.branch.id,
        deliveryDistanceKm: distanceKm,
        deliveryCharge: nearest.deliveryCharge,
        freeDeliveryDistanceKm: nearest.branch.delivery_free_distance_km,
        deliveryChargePerKm: nearest.branch.delivery_extra_charge_per_km,
        isProvisional: nearest.isProvisional,
        address: {
          id: existingAddress.id,
          address_line: existingAddress.address_line,
          normalized_address: existingAddress.normalized_address,
          latitude: existingAddress.latitude,
          longitude: existingAddress.longitude,
          calculated_distance_km: distanceKm,
          distance_calculated_at: existingAddress.distance_calculated_at,
          distance_source: newSource,
          geocoding_provider: existingAddress.geocoding_provider,
          geocoding_metadata: existingAddress.geocoding_metadata,
        },
      }
    }
  }

  // ── No cached address: resolve coordinates ──
  let resolvedCoords: { latitude: number; longitude: number; provider: string; metadata: string } | null = null

  if (customerCoords) {
    // Live location provided – use it directly, no geocoding needed
    resolvedCoords = {
      latitude: customerCoords.latitude,
      longitude: customerCoords.longitude,
      provider: "WHATSAPP_LIVE_LOCATION",
      metadata: JSON.stringify({ source: "live_location" }),
    }
  } else {
    // Manual address – geocode
    resolvedCoords = await geocodeAddress(trimmedAddress)
    if (!resolvedCoords) {
      // No coordinates at all — cannot continue, coordinates are required for branch selection
      return {
        ok: false,
        error: "We couldn't verify this delivery address. Please re-enter a clearer address or share your live location.",
      }
    }
  }

  // ── Select nearest active branch using resolved coordinates ──
  const branches = await getActiveBranchesWithLocations(restaurantId)
  if (branches.length === 0) {
    return { ok: false, error: "No active branches are available for delivery." }
  }

  const nearest = await selectNearestEligibleBranch(resolvedCoords.latitude, resolvedCoords.longitude, branches)
  if (!nearest) {
    return {
      ok: false,
      error: "Sorry, we don't deliver to your area. Please try a different address or contact us directly.",
    }
  }

  const distanceKm = nearest.distanceKm
  const distanceSource = nearest.isProvisional ? "PROVISIONAL" : "EXACT"

  console.log(`[Delivery] New address distance: ${distanceKm} km [${distanceSource}] — branch ${nearest.branch.id}`)

  // ── Ensure customer exists (create under nearest branch) ──
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurantId,
        branch_id: nearest.branch.id,
        phone: cleanPhone,
        name: "WhatsApp Customer",
        whatsapp_number: cleanPhone,
      },
    })
  }

  // ── Save address under nearest branch ──
  const addressRecord = await prisma.customerAddress.create({
    data: {
      restaurant_id: restaurantId,
      branch_id: nearest.branch.id,
      customer_id: customer.id,
      address_line: trimmedAddress,
      normalized_address: normalizedAddress,
      latitude: resolvedCoords.latitude,
      longitude: resolvedCoords.longitude,
      calculated_distance_km: distanceKm,
      distance_calculated_at: new Date(),
      distance_source: distanceSource,
      geocoding_provider: resolvedCoords.provider,
      geocoding_metadata: resolvedCoords.metadata,
      label: "Saved Address",
    },
  })

  return {
    ok: true,
    branchId: nearest.branch.id,
    deliveryDistanceKm: distanceKm,
    deliveryCharge: nearest.deliveryCharge,
    freeDeliveryDistanceKm: nearest.branch.delivery_free_distance_km,
    deliveryChargePerKm: nearest.branch.delivery_extra_charge_per_km,
    isProvisional: nearest.isProvisional,
    address: {
      id: addressRecord.id,
      address_line: addressRecord.address_line,
      normalized_address: addressRecord.normalized_address,
      latitude: addressRecord.latitude,
      longitude: addressRecord.longitude,
      calculated_distance_km: addressRecord.calculated_distance_km,
      distance_calculated_at: addressRecord.distance_calculated_at,
      distance_source: distanceSource,
      geocoding_provider: addressRecord.geocoding_provider,
      geocoding_metadata: addressRecord.geocoding_metadata,
    },
  }
}

// ─────────────────────────────────────────────
// Resolve delivery quote from saved coordinates (live location or saved address)
// ─────────────────────────────────────────────
export async function resolveDeliveryQuoteFromCoords(
  restaurantId: string,
  customerPhone: string,
  latitude: number,
  longitude: number,
  addressLine: string,
  saveAddress: boolean = true
): Promise<DeliveryQuoteResult> {
  const cleanPhone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`

  const branches = await getActiveBranchesWithLocations(restaurantId)
  if (branches.length === 0) {
    return { ok: false, error: "No active branches are available for delivery." }
  }

  const nearest = await selectNearestEligibleBranch(latitude, longitude, branches)
  if (!nearest) {
    return {
      ok: false,
      error: "Sorry, we don't deliver to your area. Your location is beyond our maximum delivery range.",
    }
  }

  const distanceKm = nearest.distanceKm
  const distanceSource = nearest.isProvisional ? "PROVISIONAL" : "EXACT"

  console.log(`[Delivery] Coords quote: ${distanceKm} km [${distanceSource}] — branch ${nearest.branch.id}`)

  // Ensure customer exists
  let customer = await prisma.customer.findFirst({
    where: { restaurant_id: restaurantId, phone: cleanPhone },
  })

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurantId,
        branch_id: nearest.branch.id,
        phone: cleanPhone,
        name: "WhatsApp Customer",
        whatsapp_number: cleanPhone,
      },
    })
  }

  let addressRecord: { id: string; address_line: string; normalized_address: string | null; latitude: number | null; longitude: number | null; calculated_distance_km: number | null; distance_calculated_at: Date | null; distance_source: string | null; geocoding_provider: string | null; geocoding_metadata: string | null } | null = null

  if (saveAddress) {
    const normalizedAddress = normalizeAddressText(addressLine)
    addressRecord = await prisma.customerAddress.create({
      data: {
        restaurant_id: restaurantId,
        branch_id: nearest.branch.id,
        customer_id: customer.id,
        address_line: addressLine,
        normalized_address: normalizedAddress,
        latitude,
        longitude,
        calculated_distance_km: distanceKm,
        distance_calculated_at: new Date(),
        distance_source: distanceSource,
        geocoding_provider: "WHATSAPP_LIVE_LOCATION",
        geocoding_metadata: JSON.stringify({ source: "live_location" }),
        label: "Live Location",
      },
    })
  }

  return {
    ok: true,
    branchId: nearest.branch.id,
    deliveryDistanceKm: distanceKm,
    deliveryCharge: nearest.deliveryCharge,
    freeDeliveryDistanceKm: nearest.branch.delivery_free_distance_km,
    deliveryChargePerKm: nearest.branch.delivery_extra_charge_per_km,
    isProvisional: nearest.isProvisional,
    address: addressRecord
      ? {
          id: addressRecord.id,
          address_line: addressRecord.address_line,
          normalized_address: addressRecord.normalized_address,
          latitude: addressRecord.latitude,
          longitude: addressRecord.longitude,
          calculated_distance_km: addressRecord.calculated_distance_km,
          distance_calculated_at: addressRecord.distance_calculated_at,
          distance_source: addressRecord.distance_source,
          geocoding_provider: addressRecord.geocoding_provider,
          geocoding_metadata: addressRecord.geocoding_metadata,
        }
      : null,
  }
}

export async function getBranchDeliverySettings(branchId: string): Promise<BranchDeliverySettings | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      restaurant_id: true,
      latitude: true,
      longitude: true,
      delivery_enabled: true,
      delivery_free_distance_km: true,
      delivery_extra_charge_per_km: true,
      delivery_charge_rounding: true,
      delivery_max_distance_km: true,
    },
  })

  return branch
}
