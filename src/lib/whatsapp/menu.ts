import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

export interface GetMenuItemsOptions {
  categoryId?: string
  onlyTodaySpecials?: boolean
  onlyBestsellers?: boolean
  searchQuery?: string
}

/**
 * Clean up expired Today's Specials for a restaurant if special_until_date has passed.
 */
export async function cleanupExpiredSpecials(restaurantId: string): Promise<void> {
  const now = new Date()
  await prisma.menuItem.updateMany({
    where: {
      restaurant_id: restaurantId,
      is_today_special: true,
      special_until_date: {
        lt: now,
      },
    },
    data: {
      is_today_special: false,
      special_until_date: null,
    },
  })
}

/**
 * Fetch active categories for a restaurant sorted by display order.
 */
export async function getMenuCategories(restaurantId: string) {
  if (!restaurantId) return []

  return await prisma.menuCategory.findMany({
    where: {
      restaurant_id: restaurantId,
      is_active: true,
    },
    orderBy: { sort_order: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      sort_order: true,
      _count: {
        select: {
          items: {
            where: {
              is_active: true,
              is_available: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Fetch customer-orderable menu items for a restaurant.
 * Enforces:
 * - Restaurant isolation (where: { restaurant_id: restaurantId })
 * - Item is active (is_active: true)
 * - Item is available (is_available: true)
 * - Parent Category is active (category: { is_active: true })
 * - Only available variants and add-ons are returned
 */
export async function getMenuItems(restaurantId: string, options: GetMenuItemsOptions = {}) {
  if (!restaurantId) return []

  await cleanupExpiredSpecials(restaurantId)

  const whereClause: Prisma.MenuItemWhereInput = {
    restaurant_id: restaurantId,
    is_active: true,
    is_available: true,
    category: {
      is_active: true,
    },
  }

  if (options.categoryId) {
    whereClause.category_id = options.categoryId
  }

  if (options.onlyTodaySpecials) {
    whereClause.is_today_special = true
  }

  if (options.onlyBestsellers) {
    whereClause.is_bestseller = true
  }

  if (options.searchQuery && options.searchQuery.trim() !== "") {
    const term = options.searchQuery.trim().toLowerCase()
    whereClause.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { category: { name: { contains: term, mode: "insensitive" } } },
    ]
  }

  return await prisma.menuItem.findMany({
    where: whereClause,
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      variants: {
        where: { is_available: true },
        orderBy: { sort_order: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          is_available: true,
        },
      },
      addons: {
        where: { is_available: true },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          is_available: true,
        },
      },
    },
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
  })
}

/**
 * Fetch a single menu item by ID for a specific restaurant.
 */
export async function getMenuItem(restaurantId: string, menuItemId: string) {
  if (!restaurantId || !menuItemId) return null

  return await prisma.menuItem.findFirst({
    where: {
      id: menuItemId,
      restaurant_id: restaurantId,
      is_active: true,
      is_available: true,
      category: {
        is_active: true,
      },
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      variants: {
        where: { is_available: true },
        orderBy: { sort_order: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          is_available: true,
        },
      },
      addons: {
        where: { is_available: true },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          is_available: true,
        },
      },
    },
  })
}

/**
 * Search menu items safely for a restaurant.
 */
export async function searchMenuItems(restaurantId: string, searchTerm: string) {
  if (!restaurantId || !searchTerm || searchTerm.trim() === "") return []
  return await getMenuItems(restaurantId, { searchQuery: searchTerm })
}

/**
 * Get entire active menu grouped by active categories.
 */
export async function getRestaurantMenu(restaurantId: string) {
  if (!restaurantId) return { categories: [], items: [] }

  const [categories, items] = await Promise.all([
    getMenuCategories(restaurantId),
    getMenuItems(restaurantId),
  ])

  return {
    categories,
    items,
  }
}
