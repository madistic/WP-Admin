import { getMenuCategories, getMenuItems, getMenuItem } from "./menu"

export interface WhatsAppCategoryFormat {
  id: string
  title: string
  description?: string
  item_count: number
}

export interface WhatsAppItemFormat {
  id: string
  name: string
  description?: string
  price_display: string
  price: number
  category_name: string
  is_veg: boolean
  is_today_special: boolean
  is_bestseller: boolean
  prep_time_minutes?: number
  has_variants: boolean
  variants: Array<{ id: string; name: string; price_display: string; price: number }>
  has_addons: boolean
  addons: Array<{ id: string; name: string; price_display: string; price: number }>
}

/**
 * Converts RESTOPRO category data into WhatsApp list / menu format.
 */
export function formatCategoriesForWhatsApp(categories: Array<{ id: string; name: string; description?: string | null; _count?: { items: number } }>): WhatsAppCategoryFormat[] {
  return categories.map((cat) => ({
    id: cat.id,
    title: cat.name,
    description: cat.description || undefined,
    item_count: cat._count?.items || 0,
  }))
}

/**
 * Converts RESTOPRO item data into WhatsApp product card format.
 */
export function formatItemsForWhatsApp(items: Array<any>): WhatsAppItemFormat[] {
  return items.map((item) => ({
    id: item.id,
    name: `${item.is_veg ? "🟢" : "🔴"} ${item.name}`,
    description: item.description || undefined,
    price_display: `₹${item.price.toFixed(2)}`,
    price: item.price,
    category_name: item.category?.name || "",
    is_veg: item.is_veg,
    is_today_special: item.is_today_special,
    is_bestseller: item.is_bestseller,
    prep_time_minutes: item.prep_time_minutes || undefined,
    has_variants: item.variants && item.variants.length > 0,
    variants: (item.variants || []).map((v: { id: string; name: string; price: number }) => ({
      id: v.id,
      name: v.name,
      price_display: `₹${v.price.toFixed(2)}`,
      price: v.price,
    })),
    has_addons: item.addons && item.addons.length > 0,
    addons: (item.addons || []).map((a: { id: string; name: string; price: number }) => ({
      id: a.id,
      name: a.name,
      price_display: `+₹${a.price.toFixed(2)}`,
      price: a.price,
    })),
  }))
}

/**
 * Adapter wrapper to get formatted WhatsApp category list for a restaurant.
 */
export async function getWhatsAppCategories(restaurantId: string): Promise<WhatsAppCategoryFormat[]> {
  const categories = await getMenuCategories(restaurantId)
  return formatCategoriesForWhatsApp(categories)
}

/**
 * Adapter wrapper to get formatted WhatsApp menu items for a category or search query.
 */
export async function getWhatsAppItems(
  restaurantId: string,
  options?: { categoryId?: string; searchQuery?: string }
): Promise<WhatsAppItemFormat[]> {
  const items = await getMenuItems(restaurantId, options)
  return formatItemsForWhatsApp(items)
}

/**
 * Adapter wrapper to get formatted WhatsApp item details.
 */
export async function getWhatsAppItemDetails(
  restaurantId: string,
  menuItemId: string
): Promise<WhatsAppItemFormat | null> {
  const item = await getMenuItem(restaurantId, menuItemId)
  if (!item) return null
  return formatItemsForWhatsApp([item])[0] || null
}

/**
 * Formats WhatsApp text message response for product details.
 */
export function formatWhatsAppProductDetailText(item: WhatsAppItemFormat): string {
  const lines: string[] = []
  lines.push(`*${item.name}*`)
  if (item.description) lines.push(`_${item.description}_`)
  lines.push(`\n💰 *Price:* ${item.price_display}`)
  if (item.prep_time_minutes) lines.push(`⏱️ *Prep Time:* ${item.prep_time_minutes} mins`)
  if (item.is_bestseller) lines.push(`⭐ *Bestseller*`)
  if (item.is_today_special) lines.push(`🌟 *Today's Special*`)

  if (item.has_variants) {
    lines.push(`\n*Available Sizes / Options:*`)
    item.variants.forEach((v) => {
      lines.push(`• ${v.name}: ${v.price_display}`)
    })
  }

  if (item.has_addons) {
    lines.push(`\n*Optional Add-ons:*`)
    item.addons.forEach((a) => {
      lines.push(`• ${a.name}: ${a.price_display}`)
    })
  }

  return lines.join("\n")
}
