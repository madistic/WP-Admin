export const CUSTOMER_BRAND_NAME = "LICK & BITE"

export const CUSTOMER_BRAND_PROFILE = `LICK & BITE

🐔 Fresh handmade food | 100% Halal
🍔 Burger | Pizza | Sandwich | Pasta | Mocktails & More
🧑‍🍳 Handmade Patty | Handmade Dough & Sauces
⏰ 4:30 PM to 1:30 AM`

export function getCustomerReviewLink(): string | null {
  const reviewLink = process.env.REVIEW_LINK || process.env.GOOGLE_REVIEW_URL
  return reviewLink?.trim() || null
}
