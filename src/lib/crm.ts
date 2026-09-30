import prisma from "@/lib/prisma"
import { calculateRFM, RFMSegmentKey } from "@/lib/rfm"

export type CustomerSegment =
  | "ALL"
  | "NEW"
  | "REGULAR"
  | "LOYAL"
  | "INACTIVE"
  | "NEVER_PURCHASED"
  | `RFM_${RFMSegmentKey}`
  | RFMSegmentKey

export interface CRMFilterOptions {
  segment?: CustomerSegment | "ALL" | string
  branchId?: string
  lastPurchaseBefore?: Date
  lastPurchaseAfter?: Date
  minSpend?: number
}

/**
 * Identify a customer's favorite menu item (by name) based on their past orders.
 */
export async function getFavoriteItemForCustomer(customerId: string): Promise<string | null> {
  // Aggregate order items to find the most frequent one
  const items = await prisma.orderItem.groupBy({
    by: ['item_name_snapshot'],
    where: {
      order: {
        customer_id: customerId,
        status: { in: ["DELIVERED"] }, // completed orders only
      }
    },
    _sum: {
      quantity: true
    },
    orderBy: {
      _sum: {
        quantity: 'desc'
      }
    },
    take: 1
  })

  if (items.length > 0 && (items[0]._sum?.quantity || 0) >= 2) {
    return items[0].item_name_snapshot
  }

  // Need at least 2 purchases to call it a "favorite"
  return null
}

/**
 * Returns a personalized message for a customer, replacing template variables.
 */
export async function personalizeMessage(template: string, customerId: string, customerName: string): Promise<string | null> {
  let message = template.replace(/\{\{customer_name\}\}/g, customerName || "there")

  if (message.includes("{{favorite_item}}")) {
    const favoriteItem = await getFavoriteItemForCustomer(customerId)
    if (favoriteItem) {
      message = message.replace(/\{\{favorite_item\}\}/g, favoriteItem)
    } else {
      // If customer has no favorite item, gracefully remove the sentence containing the placeholder
      const sentences = message.split(/([.!?\n]+)/)
      let newMessage = ""
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i]
        const punctuation = sentences[i + 1] || ""
        if (sentence && !sentence.includes("{{favorite_item}}")) {
          newMessage += (newMessage.length > 0 ? sentence : sentence.trimStart()) + punctuation
        }
      }
      message = newMessage.trim()

      // If the original template didn't have a greeting and we removed the opening sentence,
      // prepend a default friendly greeting.
      const lower = message.toLowerCase()
      if (!lower.includes("hi ") && !lower.includes("hello ") && customerName) {
        message = `Hi ${customerName} 👋 ${message}`
      }
    }
  }

  return message || null
}

/**
 * Get customers by segment or filters.
 */
export async function getCustomersForCampaign(restaurantId: string, filters: CRMFilterOptions) {
  const whereClause: any = {
    restaurant_id: restaurantId,
    is_active: true,
    whatsapp_number: { not: null } // Must have a valid WhatsApp number
  }

  if (filters.branchId) {
    whereClause.branch_id = filters.branchId
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // RFM Segmentation filtering using the shared calculation engine
  const isRfmFilter = Boolean(
    filters.segment &&
      (filters.segment.startsWith("RFM_") ||
        filters.segment in {
          CHAMPIONS: 1,
          LOYAL_CUSTOMERS: 1,
          POTENTIAL_LOYALISTS: 1,
          NEW_CUSTOMERS: 1,
          PROMISING: 1,
          NEED_ATTENTION: 1,
          ABOUT_TO_SLEEP: 1,
          AT_RISK: 1,
          CANT_LOSE_THEM: 1,
          LOW_MONETARY: 1,
          LOST: 1,
        })
  )

  if (isRfmFilter) {
    const targetKey = (filters.segment || "").replace(/^RFM_/, "") as RFMSegmentKey

    const customersWithOrders = await prisma.customer.findMany({
      where: {
        restaurant_id: restaurantId,
        is_active: true,
        whatsapp_number: { not: null },
        ...(filters.branchId ? { branch_id: filters.branchId } : {}),
      },
      include: {
        orders: {
          where: { status: { in: ["DELIVERED"] } },
          select: { id: true, total: true, created_at: true },
          orderBy: { created_at: "desc" },
        },
      },
    })

    const rfmInput = customersWithOrders.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.whatsapp_number || c.phone,
      orders: c.orders,
      ordersCount: c.orders.length,
      totalSpend: c.orders.reduce((sum, o) => sum + o.total, 0),
      lastOrder: c.orders.length > 0 ? c.orders[0].created_at : null,
      firstOrder: c.orders.length > 0 ? c.orders[c.orders.length - 1].created_at : null,
    }))

    const { customerScoreMap } = calculateRFM(rfmInput)

    const matchedCustomers: any[] = []
    for (const c of customersWithOrders) {
      const rfm = customerScoreMap.get(c.id)
      if (rfm && rfm.rfmSegmentKey === targetKey) {
        matchedCustomers.push({
          ...c,
          rfm,
        })
      }
    }

    return matchedCustomers
  }

  // Segment logic based on purchase history (existing legacy segments)
  if (filters.segment && filters.segment !== "ALL") {
    switch (filters.segment) {
      case "NEW":
        // 1 completed order within the last 7 days
        whereClause.orders = {
          some: {
            status: { in: ["DELIVERED"] },
            created_at: { gte: sevenDaysAgo }
          }
        }
        break
      
      case "REGULAR":
        // 2-4 completed orders in the last 30 days
        whereClause.orders = {
          some: {
            status: { in: ["DELIVERED"] },
            created_at: { gte: thirtyDaysAgo }
          }
        }
        // We'll refine this exact count using a post-filter or a subquery if needed, 
        // but Prisma can't easily express "HAVING count BETWEEN 2 AND 4" directly in `some`.
        break

      case "LOYAL":
        // 5+ completed orders in the last 30 days
        break

      case "INACTIVE":
        // Has ordered before, but NOT in the last 30 days
        whereClause.orders = {
          some: {
            status: { in: ["DELIVERED"] },
            created_at: { lt: thirtyDaysAgo }
          },
          none: {
            status: { in: ["DELIVERED"] },
            created_at: { gte: thirtyDaysAgo }
          }
        }
        break

      case "NEVER_PURCHASED":
        // 0 completed orders
        whereClause.orders = {
          none: {
            status: { in: ["DELIVERED"] }
          }
        }
        break
    }
  }

  // To properly handle REGULAR and LOYAL which require exact counts, we might need a custom query or post-filtering.
  // For safety and performance, we'll fetch them all if REGULAR/LOYAL and filter in memory, 
  // or use raw SQL if dataset is huge. For now, we will fetch and filter.

  const customers = await prisma.customer.findMany({
    where: whereClause,
    include: {
      orders: {
        where: {
          status: { in: ["DELIVERED"] },
          created_at: { gte: thirtyDaysAgo }
        },
        select: { id: true }
      }
    }
  })

  // Post-filter for REGULAR and LOYAL
  let filteredCustomers: any[] = customers
  if (filters.segment === "REGULAR") {
    filteredCustomers = customers.filter((c: any) => c.orders && c.orders.length >= 2 && c.orders.length <= 4)
  } else if (filters.segment === "LOYAL") {
    filteredCustomers = customers.filter((c: any) => c.orders && c.orders.length >= 5)
  }

  return filteredCustomers
}
