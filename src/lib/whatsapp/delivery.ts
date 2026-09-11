import prisma from "@/lib/prisma"
import { OrderType } from "@prisma/client"

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
  address?: {
    id: string
    address_line: string
    normalized_address: string | null
    latitude: number | null
    longitude: number | null
    calculated_distance_km: number | null
    distance_calculated_at: Date | null
    geocoding_provider: string | null
    geocoding_metadata: string | null
  } | null
}

// ─────────────────────────────────────────────
// Haversine Distance (straight-line in KM)
// ─────────────────────────────────────────────
export function calculateDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadiusKm = 6371
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180

  const dLat = toRadians(latitude2 - latitude1)
  const dLng = toRadians(longitude2 - longitude1)
  const lat1Rad = toRadians(latitude1)
  const lat2Rad = toRadians(latitude2)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((earthRadiusKm * c).toFixed(2))
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
// Select nearest active branch to customer coordinates
// Returns null if no branch can serve the customer (too far / all inactive)
// ─────────────────────────────────────────────
export interface NearestBranchResult {
  branch: BranchDeliverySettings
  distanceKm: number
  deliveryCharge: number
}

export function selectNearestEligibleBranch(
  customerLat: number,
  customerLng: number,
  branches: BranchDeliverySettings[]
): NearestBranchResult | null {
  let best: NearestBranchResult | null = null

  for (const branch of branches) {
    if (!branch.latitude || !branch.longitude) continue
    if (!branch.delivery_enabled) continue

    const distanceKm = calculateDistanceKm(branch.latitude, branch.longitude, customerLat, customerLng)

    // If branch has a max delivery distance, skip branches that are too far
    if (branch.delivery_max_distance_km !== null && branch.delivery_max_distance_km !== undefined) {
      if (distanceKm > branch.delivery_max_distance_km) continue
    }

    const { deliveryCharge } = calculateDeliveryCharge(distanceKm, branch)

    if (best === null || distanceKm < best.distanceKm) {
      best = { branch, distanceKm, deliveryCharge }
    }
  }

  return best
}

// ─────────────────────────────────────────────
// Geocode address using Nominatim (OpenStreetMap)
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
    console.error("[WhatsApp Delivery] Geocoding failed:", error)
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
  // We need to look up customer across all branches (by restaurant + phone),
  // but for address storage we use the eventually-selected branch
  let customer = await prisma.customer.findFirst({
    where: {
      restaurant_id: restaurantId,
      phone: cleanPhone,
    },
  })

  // ── Check for existing verified address (cache hit → skip geocoding) ──
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
      // Cache hit: use saved coordinates, select nearest branch
      const branches = await getActiveBranchesWithLocations(restaurantId)
      if (branches.length === 0) {
        return { ok: false, error: "No active branches are available for delivery." }
      }

      const nearest = selectNearestEligibleBranch(existingAddress.latitude, existingAddress.longitude, branches)
      if (!nearest) {
        return {
          ok: false,
          error: "Sorry, we don't deliver to your area. Please try a different address.",
        }
      }

      // Update cached distance if needed (branch may have moved)
      const distanceKm = nearest.distanceKm
      if (existingAddress.calculated_distance_km !== distanceKm) {
        await prisma.customerAddress.update({
          where: { id: existingAddress.id },
          data: {
            calculated_distance_km: distanceKm,
            distance_calculated_at: new Date(),
            branch_id: nearest.branch.id, // update to nearest branch
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
        address: {
          id: existingAddress.id,
          address_line: existingAddress.address_line,
          normalized_address: existingAddress.normalized_address,
          latitude: existingAddress.latitude,
          longitude: existingAddress.longitude,
          calculated_distance_km: distanceKm,
          distance_calculated_at: existingAddress.distance_calculated_at,
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
    // Manual address – geocode via Nominatim
    resolvedCoords = await geocodeAddress(trimmedAddress)
    if (!resolvedCoords) {
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

  const nearest = selectNearestEligibleBranch(resolvedCoords.latitude, resolvedCoords.longitude, branches)
  if (!nearest) {
    return {
      ok: false,
      error: "Sorry, we don't deliver to your area. Please try a different address or contact us directly.",
    }
  }

  const distanceKm = nearest.distanceKm

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
    address: {
      id: addressRecord.id,
      address_line: addressRecord.address_line,
      normalized_address: addressRecord.normalized_address,
      latitude: addressRecord.latitude,
      longitude: addressRecord.longitude,
      calculated_distance_km: addressRecord.calculated_distance_km,
      distance_calculated_at: addressRecord.distance_calculated_at,
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

  const nearest = selectNearestEligibleBranch(latitude, longitude, branches)
  if (!nearest) {
    return {
      ok: false,
      error: "Sorry, we don't deliver to your area. Your location is beyond our maximum delivery range.",
    }
  }

  const distanceKm = nearest.distanceKm

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

  let addressRecord: { id: string; address_line: string; normalized_address: string | null; latitude: number | null; longitude: number | null; calculated_distance_km: number | null; distance_calculated_at: Date | null; geocoding_provider: string | null; geocoding_metadata: string | null } | null = null

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
    address: addressRecord
      ? {
          id: addressRecord.id,
          address_line: addressRecord.address_line,
          normalized_address: addressRecord.normalized_address,
          latitude: addressRecord.latitude,
          longitude: addressRecord.longitude,
          calculated_distance_km: addressRecord.calculated_distance_km,
          distance_calculated_at: addressRecord.distance_calculated_at,
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
