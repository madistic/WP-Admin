export const CUSTOMER_BRAND_NAME = "LICK & BITE"

export const CUSTOMER_BRAND_PROFILE = `LICK & BITE

🐔 Fresh handmade food | 100% Halal
🍔 Burger | Pizza | Sandwich | Pasta | Mocktails & More
🧑‍🍳 Handmade Patty | Handmade Dough & Sauces
⏰ 4:30 PM to 1:30 AM`

/**
 * @deprecated The Google Review link is now stored in the Restaurant.google_review_url DB field.
 * Use notifications.ts (WhatsAppNotificationProvider.getRestaurantMeta) to read it from the DB.
 * This function is retained for reference only and should not be called.
 */
export function getCustomerReviewLink(): string | null {
  return null
}
