import prisma from "@/lib/prisma"

/**
 * Retrieves a restaurant record using the Meta WhatsApp phone_number_id.
 * NEVER accepts restaurant_id from customer/message body.
 * Multi-tenant isolation anchor point.
 */
export async function getRestaurantByWhatsAppPhoneNumberId(phoneNumberId: string) {
  if (!phoneNumberId || phoneNumberId.trim() === "") {
    return null
  }

  return await prisma.restaurant.findUnique({
    where: {
      whatsapp_phone_number_id: phoneNumberId.trim(),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      whatsapp_number: true,
      whatsapp_phone_number_id: true,
      is_open: true,
      delivery_fee: true,
      minimum_order: true,
    },
  })
}

/**
 * Safely looks up or creates a customer for a SPECIFIC restaurant.
 * Customer identity is scoped by (restaurant_id, whatsapp_number).
 */
export async function getOrCreateCustomerForRestaurant(
  restaurantId: string,
  whatsappNumber: string,
  name?: string
) {
  if (!restaurantId || !whatsappNumber) {
    throw new Error("restaurantId and whatsappNumber are required for tenant-scoped customer lookup")
  }

  // Format phone number to clean representation
  const cleanPhone = whatsappNumber.startsWith("+") ? whatsappNumber : `+${whatsappNumber}`

  // Look up existing customer ONLY for this specific restaurant
  const existing = await prisma.customer.findFirst({
    where: {
      restaurant_id: restaurantId,
      whatsapp_number: cleanPhone,
    },
  })

  if (existing) {
    return existing
  }

  // Create new Customer record strictly anchored to this restaurant_id
  return await prisma.customer.create({
    data: {
      restaurant_id: restaurantId,
      name: name || `WhatsApp Customer (${cleanPhone.slice(-4)})`,
      phone: cleanPhone,
      whatsapp_number: cleanPhone,
    },
  })
}
