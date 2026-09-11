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
}

export interface DeliveryQuoteResult {
  ok: boolean
  error?: string
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

function calculateDistanceKm(
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

function calculateDeliveryCharge(
  distanceKm: number,
  settings: BranchDeliverySettings
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
    extraDistanceUnits = Math.ceil(extraDistance)
  }

  const deliveryCharge = Number((extraDistanceUnits * settings.delivery_extra_charge_per_km).toFixed(2))

  return { deliveryCharge, extraDistanceKm: extraDistanceUnits }
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
    },
  })

  return branch
}

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

export async function resolveWhatsappDeliveryQuote(
  restaurantId: string,
  branchId: string,
  customerPhone: string,
  deliveryAddress: string,
  orderType: OrderType
): Promise<DeliveryQuoteResult> {
  const cleanPhone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`

  if (orderType === OrderType.TAKEAWAY) {
    return {
      ok: true,
      deliveryDistanceKm: 0,
      deliveryCharge: 0,
      freeDeliveryDistanceKm: 0,
      deliveryChargePerKm: 0,
      address: null,
    }
  }

  const branch = await getBranchDeliverySettings(branchId)
  if (!branch) {
    return {
      ok: false,
      error: "Branch delivery settings are not configured yet.",
    }
  }

  if (!branch.delivery_enabled) {
    return {
      ok: false,
      error: "Home delivery is currently unavailable for this branch.",
    }
  }

  if (!branch.latitude || !branch.longitude) {
    return {
      ok: false,
      error: "This branch location is not configured yet. Please contact the restaurant admin.",
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

  let customer = await prisma.customer.findFirst({
    where: {
      restaurant_id: restaurantId,
      branch_id: branchId,
      phone: cleanPhone,
    },
  })

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurantId,
        branch_id: branchId,
        phone: cleanPhone,
        name: "WhatsApp Customer",
        whatsapp_number: cleanPhone,
      },
    })
  }

  const existingAddress = await prisma.customerAddress.findFirst({
    where: {
      restaurant_id: restaurantId,
      branch_id: branchId,
      customer_id: customer.id,
      OR: [
        { normalized_address: normalizedAddress },
        { address_line: { equals: trimmedAddress, mode: "insensitive" } },
      ],
    },
    orderBy: { created_at: "desc" },
  })

  let addressRecord = existingAddress

  if (existingAddress && existingAddress.latitude && existingAddress.longitude) {
    const calculatedDistanceKm =
      existingAddress.calculated_distance_km ??
      calculateDistanceKm(
        branch.latitude,
        branch.longitude,
        existingAddress.latitude,
        existingAddress.longitude
      )

    if (existingAddress.calculated_distance_km === null || existingAddress.calculated_distance_km === undefined) {
      await prisma.customerAddress.update({
        where: { id: existingAddress.id },
        data: {
          calculated_distance_km: calculatedDistanceKm,
          distance_calculated_at: new Date(),
        },
      })
    }

    const pricing = calculateDeliveryCharge(calculatedDistanceKm, branch)

    return {
      ok: true,
      deliveryDistanceKm: calculatedDistanceKm,
      deliveryCharge: pricing.deliveryCharge,
      freeDeliveryDistanceKm: branch.delivery_free_distance_km,
      deliveryChargePerKm: branch.delivery_extra_charge_per_km,
      address: {
        id: existingAddress.id,
        address_line: existingAddress.address_line,
        normalized_address: existingAddress.normalized_address,
        latitude: existingAddress.latitude,
        longitude: existingAddress.longitude,
        calculated_distance_km: calculatedDistanceKm,
        distance_calculated_at: existingAddress.distance_calculated_at,
        geocoding_provider: existingAddress.geocoding_provider,
        geocoding_metadata: existingAddress.geocoding_metadata,
      },
    }
  }

  const geocodedAddress = await geocodeAddress(trimmedAddress)

  if (!geocodedAddress) {
    return {
      ok: false,
      error: "We couldn't verify this delivery address. Please re-enter a clearer address.",
    }
  }

  const deliveryDistanceKm = calculateDistanceKm(
    branch.latitude,
    branch.longitude,
    geocodedAddress.latitude,
    geocodedAddress.longitude
  )

  const pricing = calculateDeliveryCharge(deliveryDistanceKm, branch)

  if (addressRecord) {
    addressRecord = await prisma.customerAddress.update({
      where: { id: addressRecord.id },
      data: {
        normalized_address: normalizedAddress,
        latitude: geocodedAddress.latitude,
        longitude: geocodedAddress.longitude,
        calculated_distance_km: deliveryDistanceKm,
        distance_calculated_at: new Date(),
        geocoding_provider: geocodedAddress.provider,
        geocoding_metadata: geocodedAddress.metadata,
      },
    })
  } else {
    addressRecord = await prisma.customerAddress.create({
      data: {
        restaurant_id: restaurantId,
        branch_id: branchId,
        customer_id: customer.id,
        address_line: trimmedAddress,
        normalized_address: normalizedAddress,
        latitude: geocodedAddress.latitude,
        longitude: geocodedAddress.longitude,
        calculated_distance_km: deliveryDistanceKm,
        distance_calculated_at: new Date(),
        geocoding_provider: geocodedAddress.provider,
        geocoding_metadata: geocodedAddress.metadata,
        label: "Saved Address",
      },
    })
  }

  return {
    ok: true,
    deliveryDistanceKm,
    deliveryCharge: pricing.deliveryCharge,
    freeDeliveryDistanceKm: branch.delivery_free_distance_km,
    deliveryChargePerKm: branch.delivery_extra_charge_per_km,
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
