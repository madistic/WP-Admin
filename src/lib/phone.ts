/**
 * Phone number normalization utility.
 * Formats numbers into E.164 canonical format (e.g. +919876543210).
 * Handles common Indian formats like 9876543210, +919876543210, +91 98765 43210, 09876543210.
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode = "91"): string {
  if (!phone) return ""

  // Strip all non-digit characters except leading plus
  let cleaned = phone.trim().replace(/[^\d+]/g, "")

  if (cleaned.startsWith("+")) {
    // Already has + country code, remove non-digits
    return "+" + cleaned.replace(/\D/g, "")
  }

  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, "")

  // If 10 digits (standard Indian mobile), prepend default country code
  if (cleaned.length === 10) {
    return `+${defaultCountryCode}${cleaned}`
  }

  // If 12 digits starting with 91, prepend plus
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`
  }

  return `+${cleaned}`
}

export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhoneNumber(phone)
  if (normalized.startsWith("+91") && normalized.length === 13) {
    const mobile = normalized.slice(3)
    return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`
  }
  return normalized
}
