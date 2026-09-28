import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Safe Growth calculation: (Current - Prev) / Prev * 100
// Strictly returns null if prev is 0 (frontend displays N/A, never Infinity or 100%)
function calcGrowth(curr: number, prev: number): number | null {
  if (prev === 0 || isNaN(prev) || isNaN(curr)) return null
  return parseFloat((((curr - prev) / prev) * 100).toFixed(1))
}

function getDateRanges(range: string, startDateParam?: string | null, endDateParam?: string | null) {
  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now)

  if (range === "TODAY") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (range === "YESTERDAY") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
  } else if (range === "7DAYS") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (range === "30DAYS") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (range === "THIS_MONTH") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (range === "CUSTOM" && startDateParam && endDateParam) {
    startDate = new Date(startDateParam)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(endDateParam)
    endDate.setHours(23, 59, 59, 999)
  } else {
    // Default to 30DAYS
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  }

  const durationMs = Math.max(1, endDate.getTime() - startDate.getTime() + 1)
  const prevEndDate = new Date(startDate.getTime() - 1)
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs + 1)

  return { startDate, endDate, prevStartDate, prevEndDate, durationMs }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id ? { branch_id: session.user.branch_id } : {}
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "30DAYS"
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    const now = new Date()
    const { startDate, endDate, prevStartDate, prevEndDate, durationMs } = getDateRanges(
      range,
      startDateParam,
      endDateParam
    )
    const daysInPeriod = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)))

    // Boundaries for explicit Today vs Yesterday calculations
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)

    // ─────────────────────────────────────────────────────────────
    // 1. CONCURRENT BATCH DATABASE READS (ZERO N+1 QUERIES)
    // ─────────────────────────────────────────────────────────────
    const [
      allOrdersInPeriod,
      prevOrdersInPeriod,
      todayOrders,
      yesterdayOrders,
      allHistoricalOrders,
      allMenuItems,
      allInventoryItems,
      allPeriodTransactions,
      prevPeriodTransactions,
      whatsAppCartsCount,
    ] = await Promise.all([
      // Current Period Orders
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: startDate, lte: endDate },
        },
        include: {
          items: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              points_balance: true,
              created_at: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),

      // Previous Period Orders (for comparative growth metrics)
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: prevStartDate, lte: prevEndDate },
        },
        include: {
          items: true,
        },
      }),

      // Today's orders
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: todayStart, lte: todayEnd },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: { id: true, total: true, subtotal: true },
      }),

      // Yesterday's orders
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: yesterdayStart, lte: yesterdayEnd },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: { id: true, total: true, subtotal: true },
      }),

      // All Historical Valid Orders (for full time-based retention, cohorts, RFM, and preferences)
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: {
          id: true,
          order_number: true,
          customer_id: true,
          customer_name_snapshot: true,
          customer_phone_snapshot: true,
          total: true,
          subtotal: true,
          delivery_fee: true,
          created_at: true,
          source: true,
          order_type: true,
          items: {
            select: {
              menu_item_id: true,
              item_name_snapshot: true,
              quantity: true,
            },
          },
        },
        orderBy: { created_at: "asc" },
      }),

      // All MenuItems with category and recipe ingredients
      prisma.menuItem.findMany({
        where: { restaurant_id: restaurantId },
        include: {
          category: { select: { id: true, name: true } },
          variants: true,
          addons: true,
          ingredients: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                  cost_per_unit: true,
                  quantity: true,
                },
              },
            },
          },
        },
      }),

      // All Active Inventory Items (current stock, opening stock, and valuations)
      prisma.inventoryItem.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          is_active: true,
        },
        include: {
          branch: { select: { id: true, name: true } },
        },
      }),

      // Current Period Inventory Transactions
      prisma.inventoryTransaction.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: startDate, lte: endDate },
        },
        include: {
          inventoryItem: {
            select: { id: true, name: true, unit: true, cost_per_unit: true },
          },
        },
        orderBy: { created_at: "desc" },
      }),

      // Previous Period Inventory Transactions (for waste & purchase growth)
      prisma.inventoryTransaction.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          created_at: { gte: prevStartDate, lte: prevEndDate },
        },
        select: {
          type: true,
          quantity: true,
          total_cost: true,
          unit_cost: true,
        },
      }),

      // WhatsApp Carts count (for WhatsApp conversion rate)
      prisma.whatsAppCart.count({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
        },
      }),
    ])

    // Filter valid (non-cancelled, non-rejected) orders
    const validCurrent = allOrdersInPeriod.filter((o) => o.status !== "CANCELLED" && o.status !== "REJECTED")
    const validPrev = prevOrdersInPeriod.filter((o) => o.status !== "CANCELLED" && o.status !== "REJECTED")

    // ─────────────────────────────────────────────────────────────
    // 2. RECIPE COST & MARGIN LOOKUP TABLE
    // ─────────────────────────────────────────────────────────────
    const menuItemLookup = new Map<string, (typeof allMenuItems)[0]>()
    const recipeCostMap = new Map<string, { cost: number; hasRecipe: boolean }>()

    for (const item of allMenuItems) {
      menuItemLookup.set(item.id, item)
      let cost = 0
      let hasRecipe = false
      if (item.ingredients && item.ingredients.length > 0) {
        hasRecipe = true
        for (const ing of item.ingredients) {
          const unitCost = ing.inventoryItem?.cost_per_unit ? Number(ing.inventoryItem.cost_per_unit) : 0
          cost += Number(ing.quantity) * unitCost
        }
      }
      recipeCostMap.set(item.id, { cost, hasRecipe })
    }

    // ─────────────────────────────────────────────────────────────
    // 3. CORE FINANCIAL & OPERATIONAL KPIS
    // ─────────────────────────────────────────────────────────────
    const grossSalesCurrent = validCurrent.reduce((acc, o) => acc + o.total, 0)
    const grossSalesPrev = validPrev.reduce((acc, o) => acc + o.total, 0)
    const grossSalesGrowth = calcGrowth(grossSalesCurrent, grossSalesPrev)

    const netSalesCurrent = validCurrent.reduce((acc, o) => acc + (o.subtotal || o.total), 0)
    const netSalesPrev = validPrev.reduce((acc, o) => acc + (o.subtotal || o.total), 0)
    const netSalesGrowth = calcGrowth(netSalesCurrent, netSalesPrev)

    const currentOrderCount = validCurrent.length
    const prevOrderCount = validPrev.length
    const orderCountGrowth = calcGrowth(currentOrderCount, prevOrderCount)

    const currentAOV = currentOrderCount > 0 ? grossSalesCurrent / currentOrderCount : 0
    const prevAOV = prevOrderCount > 0 ? grossSalesPrev / prevOrderCount : 0
    const aovGrowth = calcGrowth(currentAOV, prevAOV)

    // Calculate Gross Profit, Food Cost %, and Contribution Margin from items with recipes
    let totalCogsCurrent = 0
    let salesWithRecipeCurrent = 0
    for (const order of validCurrent) {
      for (const it of order.items) {
        const recipe = recipeCostMap.get(it.menu_item_id)
        if (recipe && recipe.hasRecipe) {
          totalCogsCurrent += recipe.cost * it.quantity
          salesWithRecipeCurrent += it.line_total
        }
      }
    }

    let totalCogsPrev = 0
    let salesWithRecipePrev = 0
    for (const order of validPrev) {
      for (const it of order.items) {
        const recipe = recipeCostMap.get(it.menu_item_id)
        if (recipe && recipe.hasRecipe) {
          totalCogsPrev += recipe.cost * it.quantity
          salesWithRecipePrev += it.line_total
        }
      }
    }

    const hasAnyRecipeData = salesWithRecipeCurrent > 0
    const currentGrossProfit = hasAnyRecipeData ? Math.round(netSalesCurrent - totalCogsCurrent) : null
    const prevGrossProfit = salesWithRecipePrev > 0 ? Math.round(netSalesPrev - totalCogsPrev) : null
    const grossProfitGrowth = currentGrossProfit !== null && prevGrossProfit !== null ? calcGrowth(currentGrossProfit, prevGrossProfit) : null

    const currentContributionMargin = currentGrossProfit !== null && netSalesCurrent > 0
      ? parseFloat(((currentGrossProfit / netSalesCurrent) * 100).toFixed(1))
      : null

    const currentFoodCostPercent = hasAnyRecipeData && netSalesCurrent > 0
      ? parseFloat(((totalCogsCurrent / netSalesCurrent) * 100).toFixed(1))
      : null

    // WhatsApp Metrics
    const whatsAppOrdersCurrent = validCurrent.filter((o) => o.source === "WHATSAPP")
    const whatsAppOrdersPrev = validPrev.filter((o) => o.source === "WHATSAPP")
    const whatsAppOrdersCount = whatsAppOrdersCurrent.length
    const whatsAppOrdersGrowth = calcGrowth(whatsAppOrdersCount, whatsAppOrdersPrev.length)
    const whatsAppConversionRate = whatsAppCartsCount > 0
      ? parseFloat(((whatsAppOrdersCount / Math.max(whatsAppOrdersCount, whatsAppCartsCount)) * 100).toFixed(1))
      : null

    // Today vs Yesterday
    const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0)
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.total, 0)
    const todaySalesGrowth = calcGrowth(todaySales, yesterdaySales)
    const todayOrderCount = todayOrders.length
    const yesterdayOrderCount = yesterdayOrders.length
    const todayOrdersGrowth = calcGrowth(todayOrderCount, yesterdayOrderCount)
    const todayAOV = todayOrderCount > 0 ? Math.round(todaySales / todayOrderCount) : 0
    const yesterdayAOV = yesterdayOrderCount > 0 ? Math.round(yesterdaySales / yesterdayOrderCount) : 0
    const todayAovGrowth = calcGrowth(todayAOV, yesterdayAOV)

    const cancelledOrdersCount = allOrdersInPeriod.filter((o) => o.status === "CANCELLED").length
    const rejectedOrdersCount = allOrdersInPeriod.filter((o) => o.status === "REJECTED").length
    const totalCancelledOrRejected = cancelledOrdersCount + rejectedOrdersCount
    const lostRevenue = allOrdersInPeriod
      .filter((o) => o.status === "CANCELLED" || o.status === "REJECTED")
      .reduce((a, c) => a + c.total, 0)

    // Status breakdown
    const statusCounts = {
      NEW: allOrdersInPeriod.filter((o) => o.status === "NEW").length,
      IN_PROCESS: allOrdersInPeriod.filter((o) => o.status === "IN_PROCESS").length,
      OUT_FOR_DELIVERY: allOrdersInPeriod.filter((o) => o.status === "OUT_FOR_DELIVERY").length,
      DELIVERED: allOrdersInPeriod.filter((o) => o.status === "DELIVERED").length,
      CANCELLED: cancelledOrdersCount,
      REJECTED: rejectedOrdersCount,
    }

    // ─────────────────────────────────────────────────────────────
    // 4. SECTION 1: CUSTOMER ANALYTICS & TIME-BASED RETENTION
    // ─────────────────────────────────────────────────────────────
    // Build full lifetime customer history map
    const customerHistMap = new Map<
      string,
      {
        id: string
        name: string
        phone: string
        firstOrder: Date
        lastOrder: Date
        orders: Array<{
          id: string
          order_number: string
          total: number
          created_at: Date
          items: Array<{ menu_item_id: string; item_name_snapshot: string; quantity: number }>
        }>
        totalSpend: number
      }
    >()

    for (const ord of allHistoricalOrders) {
      const existing = customerHistMap.get(ord.customer_id)
      const ordSummary = {
        id: ord.id,
        order_number: ord.order_number,
        total: ord.total,
        created_at: ord.created_at,
        items: ord.items,
      }
      if (!existing) {
        customerHistMap.set(ord.customer_id, {
          id: ord.customer_id,
          name: ord.customer_name_snapshot,
          phone: ord.customer_phone_snapshot,
          firstOrder: ord.created_at,
          lastOrder: ord.created_at,
          orders: [ordSummary],
          totalSpend: ord.total,
        })
      } else {
        existing.lastOrder = ord.created_at
        existing.orders.push(ordSummary)
        existing.totalSpend += ord.total
      }
    }

    const currentCustomerIds = Array.from(new Set(validCurrent.map((o) => o.customer_id)))
    const prevCustomerIds = new Set(validPrev.map((o) => o.customer_id))

    let newCustomersCount = 0
    let returningCustomersCount = 0
    let retainedFromPrevCount = 0
    let reactivatedCustomersCount = 0

    const nowMs = now.getTime()

    for (const cId of currentCustomerIds) {
      const hist = customerHistMap.get(cId)
      if (hist && hist.firstOrder >= startDate && hist.firstOrder <= endDate) {
        newCustomersCount++
      } else {
        returningCustomersCount++
        // Check if reactivated: customer ordered in this period, but prior order gap was > 60 days
        if (hist && hist.orders.length >= 2) {
          const ordersInPeriod = hist.orders.filter((o) => o.created_at >= startDate && o.created_at <= endDate)
          const ordersBeforePeriod = hist.orders.filter((o) => o.created_at < startDate)
          if (ordersInPeriod.length > 0 && ordersBeforePeriod.length > 0) {
            const firstInPeriod = ordersInPeriod[0].created_at.getTime()
            const lastBeforePeriod = ordersBeforePeriod[ordersBeforePeriod.length - 1].created_at.getTime()
            const gapDays = (firstInPeriod - lastBeforePeriod) / (1000 * 60 * 60 * 24)
            if (gapDays >= 60) {
              reactivatedCustomersCount++
            }
          }
        }
      }
      if (prevCustomerIds.has(cId)) {
        retainedFromPrevCount++
      }
    }

    const totalActiveCustomers = currentCustomerIds.length
    const prevActiveCustomers = prevCustomerIds.size
    const customerGrowth = calcGrowth(totalActiveCustomers, prevActiveCustomers)

    // Repeat rate: Returning Customers / Active Customers * 100
    const repeatCustomerRate =
      totalActiveCustomers > 0 ? parseFloat(((returningCustomersCount / totalActiveCustomers) * 100).toFixed(1)) : 0

    // Customer retention rate: Customers from previous period who ordered again in current period / prevActiveCustomers * 100
    const customerRetentionRate =
      prevActiveCustomers > 0 ? parseFloat(((retainedFromPrevCount / prevActiveCustomers) * 100).toFixed(1)) : null

    // Order Frequency = Valid Orders / Active Customers
    const orderFrequency = totalActiveCustomers > 0 ? parseFloat((currentOrderCount / totalActiveCustomers).toFixed(2)) : 0

    // Average Items Per Order = Total Items Sold / Valid Orders
    const totalItemsInPeriod = validCurrent.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0)
    const avgItemsPerOrder = currentOrderCount > 0 ? parseFloat((totalItemsInPeriod / currentOrderCount).toFixed(1)) : 0

    // Revenue Per Customer = Valid Revenue / Unique Customers
    const revenuePerCustomer = totalActiveCustomers > 0 ? Math.round(grossSalesCurrent / totalActiveCustomers) : 0
    const ordersPerCustomer = totalActiveCustomers > 0 ? parseFloat((currentOrderCount / totalActiveCustomers).toFixed(2)) : 0

    // Average Customer Lifetime Value (LTV) across active customers in this period
    let totalLtvSum = 0
    for (const cId of currentCustomerIds) {
      const hist = customerHistMap.get(cId)
      if (hist) totalLtvSum += hist.totalSpend
    }
    const avgCustomerLtv = totalActiveCustomers > 0 ? Math.round(totalLtvSum / totalActiveCustomers) : 0

    // ─────────────────────────────────────────────────────────────
    // TIME-BASED RETENTION & REORDER GAP ANALYSIS
    // ─────────────────────────────────────────────────────────────
    let totalLifetimeCustomers = customerHistMap.size
    let lifetimeWithGe2 = 0
    let lifetimeWithGe3 = 0
    let repeatWithin7Days = 0
    let repeatWithin30Days = 0
    let repeatWithin60Days = 0
    let repeatWithin90Days = 0

    let totalGapsSum = 0
    let totalGapsCount = 0
    let firstToSecondGapSum = 0
    let firstToSecondGapCount = 0

    const gapBuckets = {
      "1-7 Days": 0,
      "8-14 Days": 0,
      "15-30 Days": 0,
      "31-60 Days": 0,
      "60+ Days": 0,
    }

    let dormantCustomersCount = 0
    let churnedCustomersCount = 0

    for (const c of customerHistMap.values()) {
      const daysSinceLast = Math.max(0, Math.floor((nowMs - c.lastOrder.getTime()) / (1000 * 60 * 60 * 24)))
      if (daysSinceLast > 90) {
        churnedCustomersCount++
      } else if (daysSinceLast > 30) {
        dormantCustomersCount++
      }

      const ords = c.orders
      if (ords.length >= 2) {
        lifetimeWithGe2++
        const firstTime = ords[0].created_at.getTime()
        const secondTime = ords[1].created_at.getTime()
        const firstGapDays = Math.max(0, (secondTime - firstTime) / (1000 * 60 * 60 * 24))
        firstToSecondGapSum += firstGapDays
        firstToSecondGapCount++

        if (firstGapDays <= 7) repeatWithin7Days++
        if (firstGapDays <= 30) repeatWithin30Days++
        if (firstGapDays <= 60) repeatWithin60Days++
        if (firstGapDays <= 90) repeatWithin90Days++

        // Consecutive gaps
        for (let i = 0; i < ords.length - 1; i++) {
          const gap = Math.max(0, (ords[i + 1].created_at.getTime() - ords[i].created_at.getTime()) / (1000 * 60 * 60 * 24))
          totalGapsSum += gap
          totalGapsCount++

          if (gap <= 7) gapBuckets["1-7 Days"]++
          else if (gap <= 14) gapBuckets["8-14 Days"]++
          else if (gap <= 30) gapBuckets["15-30 Days"]++
          else if (gap <= 60) gapBuckets["31-60 Days"]++
          else gapBuckets["60+ Days"]++
        }
      }

      if (ords.length >= 3) {
        lifetimeWithGe3++
      }
    }

    const avgReorderGapDays = totalGapsCount > 0 ? parseFloat((totalGapsSum / totalGapsCount).toFixed(1)) : null
    const avgDaysFirstToSecond = firstToSecondGapCount > 0 ? parseFloat((firstToSecondGapSum / firstToSecondGapCount).toFixed(1)) : null
    const secondOrderConversionRate = totalLifetimeCustomers > 0 ? parseFloat(((lifetimeWithGe2 / totalLifetimeCustomers) * 100).toFixed(1)) : 0
    const thirdOrderConversionRate = totalLifetimeCustomers > 0 ? parseFloat(((lifetimeWithGe3 / totalLifetimeCustomers) * 100).toFixed(1)) : 0

    const repeatRate7Days = lifetimeWithGe2 > 0 ? parseFloat(((repeatWithin7Days / lifetimeWithGe2) * 100).toFixed(1)) : 0
    const repeatRate30Days = lifetimeWithGe2 > 0 ? parseFloat(((repeatWithin30Days / lifetimeWithGe2) * 100).toFixed(1)) : 0
    const repeatRate60Days = lifetimeWithGe2 > 0 ? parseFloat(((repeatWithin60Days / lifetimeWithGe2) * 100).toFixed(1)) : 0
    const repeatRate90Days = lifetimeWithGe2 > 0 ? parseFloat(((repeatWithin90Days / lifetimeWithGe2) * 100).toFixed(1)) : 0

    const customerChurnRate = totalLifetimeCustomers > 0 ? parseFloat(((churnedCustomersCount / totalLifetimeCustomers) * 100).toFixed(1)) : 0

    // Order Conversion Funnel (1st Order -> 2nd Order -> 3rd+ Order)
    const orderFunnel = [
      { step: "1st Order", count: totalLifetimeCustomers, percent: 100 },
      { step: "2nd Order", count: lifetimeWithGe2, percent: secondOrderConversionRate },
      { step: "3rd+ Order", count: lifetimeWithGe3, percent: thirdOrderConversionRate },
    ]

    // Reorder Gap Distribution Array
    const reorderGapDistribution = Object.entries(gapBuckets).map(([bucket, count]) => ({
      bucket,
      count,
      percent: totalGapsCount > 0 ? parseFloat(((count / totalGapsCount) * 100).toFixed(1)) : 0,
    }))

    // Customer Growth Trend (time series)
    const trendMap = new Map<
      string,
      {
        date: string
        label: string
        activeCusts: Set<string>
        newCusts: Set<string>
        orders: number
        revenue: number
      }
    >()

    const isSingleDay = range === "TODAY" || range === "YESTERDAY" || daysInPeriod <= 1
    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        const hourLabel = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`
        trendMap.set(String(h), {
          date: String(h),
          label: hourLabel,
          activeCusts: new Set(),
          newCusts: new Set(),
          orders: 0,
          revenue: 0,
        })
      }
    } else {
      const cur = new Date(startDate)
      while (cur <= endDate) {
        const dStr = cur.toISOString().split("T")[0]
        const label = cur.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        trendMap.set(dStr, {
          date: dStr,
          label,
          activeCusts: new Set(),
          newCusts: new Set(),
          orders: 0,
          revenue: 0,
        })
        cur.setDate(cur.getDate() + 1)
      }
    }

    for (const o of validCurrent) {
      const oDate = new Date(o.created_at)
      const key = isSingleDay ? String(oDate.getHours()) : o.created_at.toISOString().split("T")[0]
      const bucket = trendMap.get(key)
      if (bucket) {
        bucket.orders++
        bucket.revenue += o.total
        bucket.activeCusts.add(o.customer_id)
        const hist = customerHistMap.get(o.customer_id)
        if (hist && hist.firstOrder >= startDate && hist.firstOrder <= endDate) {
          bucket.newCusts.add(o.customer_id)
        }
      }
    }

    const customerGrowthTrend = Array.from(trendMap.values()).map((b) => ({
      date: b.date,
      label: b.label,
      activeCustomers: b.activeCusts.size,
      newCustomers: b.newCusts.size,
      orders: b.orders,
      revenue: Math.round(b.revenue),
    }))

    // Orders by Day of Week
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeekStats = dayNames.map((dayName, idx) => {
      const dayOrders = validCurrent.filter((o) => new Date(o.created_at).getDay() === idx)
      const revenue = dayOrders.reduce((a, c) => a + c.total, 0)
      return {
        day: dayName,
        shortDay: dayName.slice(0, 3),
        revenue: Math.round(revenue),
        orders: dayOrders.length,
        aov: dayOrders.length > 0 ? Math.round(revenue / dayOrders.length) : 0,
      }
    })

    // Orders by Hour
    const hourlyStats = Array.from({ length: 24 }, (_, hour) => {
      const ordersInHour = validCurrent.filter((o) => new Date(o.created_at).getHours() === hour)
      return {
        hour,
        label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`,
        orders: ordersInHour.length,
        revenue: Math.round(ordersInHour.reduce((a, c) => a + c.total, 0)),
      }
    })
    const peakHourStat = [...hourlyStats].sort((a, b) => b.orders - a.orders)[0]
    const peakHourText =
      peakHourStat && peakHourStat.orders > 0
        ? `${peakHourStat.label} (${peakHourStat.orders} orders)`
        : "N/A"

    // Orders by Order Source
    const sourceMap = new Map<string, { source: string; orders: number; revenue: number }>()
    for (const o of validCurrent) {
      const src = o.source || "OTHER"
      const existing = sourceMap.get(src) || { source: src, orders: 0, revenue: 0 }
      existing.orders++
      existing.revenue += o.total
      sourceMap.set(src, existing)
    }
    const ordersBySource = Array.from(sourceMap.values()).map((s) => ({
      source: s.source,
      orders: s.orders,
      revenue: Math.round(s.revenue),
      percent: grossSalesCurrent > 0 ? parseFloat(((s.revenue / grossSalesCurrent) * 100).toFixed(1)) : 0,
    }))

    // Orders by Order Type
    const typeMap = new Map<string, { type: string; orders: number; revenue: number }>()
    for (const o of validCurrent) {
      const typ = o.order_type || "HOME_DELIVERY"
      const existing = typeMap.get(typ) || { type: typ, orders: 0, revenue: 0 }
      existing.orders++
      existing.revenue += o.total
      typeMap.set(typ, existing)
    }
    const ordersByOrderType = Array.from(typeMap.values()).map((t) => ({
      type: t.type,
      label: t.type.replace(/_/g, " "),
      orders: t.orders,
      revenue: Math.round(t.revenue),
      percent: grossSalesCurrent > 0 ? parseFloat(((t.revenue / grossSalesCurrent) * 100).toFixed(1)) : 0,
    }))

    // Customer Location / Area Performance
    const areaMap = new Map<string, { area: string; orders: number; revenue: number }>()
    for (const o of validCurrent) {
      if (o.delivery_address_snapshot && o.delivery_address_snapshot.trim()) {
        const parts = o.delivery_address_snapshot.split(",")
        const areaCandidate = parts.length >= 2 ? parts[parts.length - 2].trim() : parts[0].trim()
        const areaName = areaCandidate.slice(0, 30) || "Local"
        const existing = areaMap.get(areaName) || { area: areaName, orders: 0, revenue: 0 }
        existing.orders++
        existing.revenue += o.total
        areaMap.set(areaName, existing)
      }
    }
    const locationStats = Array.from(areaMap.values())
      .map((l) => ({
        area: l.area,
        orders: l.orders,
        revenue: Math.round(l.revenue),
        aov: l.orders > 0 ? Math.round(l.revenue / l.orders) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)

    // Loyalty vs Non-Loyalty
    let loyaltyOrders = 0
    let loyaltyRevenue = 0
    const loyaltyCustSet = new Set<string>()
    let nonLoyaltyOrders = 0
    let nonLoyaltyRevenue = 0
    const nonLoyaltyCustSet = new Set<string>()

    for (const o of validCurrent) {
      const isLoyal = (o.customer?.points_balance || 0) > 0 || o.points_earned > 0 || o.points_redeemed > 0
      if (isLoyal) {
        loyaltyOrders++
        loyaltyRevenue += o.total
        loyaltyCustSet.add(o.customer_id)
      } else {
        nonLoyaltyOrders++
        nonLoyaltyRevenue += o.total
        nonLoyaltyCustSet.add(o.customer_id)
      }
    }

    const loyaltyComparison = {
      loyalty: {
        customers: loyaltyCustSet.size,
        orders: loyaltyOrders,
        revenue: Math.round(loyaltyRevenue),
        aov: loyaltyOrders > 0 ? Math.round(loyaltyRevenue / loyaltyOrders) : 0,
      },
      nonLoyalty: {
        customers: nonLoyaltyCustSet.size,
        orders: nonLoyaltyOrders,
        revenue: Math.round(nonLoyaltyRevenue),
        aov: nonLoyaltyOrders > 0 ? Math.round(nonLoyaltyRevenue / nonLoyaltyOrders) : 0,
      },
    }

    // Customer Preference Analytics (Veg vs Non-Veg, Favourite Dish/Category)
    let vegItemsSold = 0
    let nonVegItemsSold = 0
    const dishCountMap = new Map<string, number>()
    const catCountMap = new Map<string, number>()

    for (const o of validCurrent) {
      for (const it of o.items) {
        const mi = menuItemLookup.get(it.menu_item_id)
        if (mi) {
          if (mi.is_veg) vegItemsSold += it.quantity
          else nonVegItemsSold += it.quantity
          if (mi.category?.name) {
            catCountMap.set(mi.category.name, (catCountMap.get(mi.category.name) || 0) + it.quantity)
          }
        }
        dishCountMap.set(it.item_name_snapshot, (dishCountMap.get(it.item_name_snapshot) || 0) + it.quantity)
      }
    }

    const totalPreferenceItems = vegItemsSold + nonVegItemsSold
    const vegPreference = {
      vegUnits: vegItemsSold,
      nonVegUnits: nonVegItemsSold,
      vegPercent: totalPreferenceItems > 0 ? parseFloat(((vegItemsSold / totalPreferenceItems) * 100).toFixed(1)) : 50,
      nonVegPercent: totalPreferenceItems > 0 ? parseFloat(((nonVegItemsSold / totalPreferenceItems) * 100).toFixed(1)) : 50,
    }

    const favouriteDish = [...dishCountMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"
    const favouriteCategory = [...catCountMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"

    // RFM Analysis, Segments, and Decision Action Table
    const allCustomersList = Array.from(customerHistMap.values())
    const spendThreshold80 =
      allCustomersList.length > 0
        ? [...allCustomersList].sort((a, b) => b.totalSpend - a.totalSpend)[
            Math.floor(allCustomersList.length * 0.2)
          ]?.totalSpend || 2000
        : 2000

    const segmentCounts = {
      NEW: 0,
      REGULAR: 0,
      LOYAL: 0,
      HIGH_VALUE: 0,
      AT_RISK: 0,
      CHURNED: 0,
    }

    let atRiskSpendTotal = 0
    const customerActionTable: any[] = []

    for (const c of allCustomersList) {
      const daysSinceLastOrder = Math.max(0, Math.floor((nowMs - c.lastOrder.getTime()) / (1000 * 60 * 60 * 24)))
      let segment = "REGULAR"

      if (c.orders.length >= 1 && c.totalSpend >= spendThreshold80) {
        segment = "HIGH_VALUE"
        segmentCounts.HIGH_VALUE++
      } else if (c.orders.length >= 4 && daysSinceLastOrder <= 30) {
        segment = "LOYAL"
        segmentCounts.LOYAL++
      } else if (c.orders.length === 1 && daysSinceLastOrder <= 30) {
        segment = "NEW"
        segmentCounts.NEW++
      } else if (c.orders.length >= 2 && daysSinceLastOrder > 60) {
        segment = "CHURNED"
        segmentCounts.CHURNED++
      } else if (c.orders.length >= 2 && daysSinceLastOrder > 30) {
        segment = "AT_RISK"
        segmentCounts.AT_RISK++
        atRiskSpendTotal += c.totalSpend
      } else {
        segment = "REGULAR"
        segmentCounts.REGULAR++
      }

      // Customer individual reorder gap
      let custAvgGap: number | null = null
      if (c.orders.length >= 2) {
        let gSum = 0
        for (let i = 0; i < c.orders.length - 1; i++) {
          gSum += (c.orders[i + 1].created_at.getTime() - c.orders[i].created_at.getTime()) / (1000 * 60 * 60 * 24)
        }
        custAvgGap = parseFloat((gSum / (c.orders.length - 1)).toFixed(1))
      }

      // Customer favourite item
      const itemMap = new Map<string, number>()
      for (const ord of c.orders) {
        for (const it of ord.items) {
          itemMap.set(it.item_name_snapshot, (itemMap.get(it.item_name_snapshot) || 0) + it.quantity)
        }
      }
      const topItem = [...itemMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Various dishes"

      // Churn risk classification
      const churnRisk = daysSinceLastOrder > 60 ? "HIGH" : daysSinceLastOrder > 30 ? "MEDIUM" : "LOW"

      // Actionable recommendation
      let suggestedAction = "Maintain service excellence"
      if (churnRisk === "HIGH") {
        suggestedAction = "Send 20% win-back discount via WhatsApp"
      } else if (churnRisk === "MEDIUM") {
        suggestedAction = "Send 'We miss you' reminder with weekend combo"
      } else if (segment === "LOYAL" || segment === "HIGH_VALUE") {
        suggestedAction = "Award VIP loyalty bonus points"
      } else if (segment === "NEW") {
        suggestedAction = "Send automated 2nd-order welcome voucher"
      }

      // Period spend
      const currentPeriodOrders = validCurrent.filter((o) => o.customer_id === c.id)
      const currentPeriodRevenue = currentPeriodOrders.reduce((sum, o) => sum + o.total, 0)

      customerActionTable.push({
        id: c.id,
        name: c.name || "Valued Customer",
        phone: c.phone,
        segment,
        periodRevenue: Math.round(currentPeriodRevenue),
        periodOrders: currentPeriodOrders.length,
        lifetimeSpend: Math.round(c.totalSpend),
        lifetimeOrders: c.orders.length,
        aov: currentPeriodOrders.length > 0 ? Math.round(currentPeriodRevenue / currentPeriodOrders.length) : Math.round(c.totalSpend / c.orders.length),
        firstOrder: c.firstOrder,
        lastOrder: c.lastOrder,
        daysSinceLastOrder,
        reorderGap: custAvgGap !== null ? `${custAvgGap} days` : "Single Order",
        favouriteDish: topItem,
        churnRisk,
        suggestedAction,
      })
    }

    const topCustomers = [...customerActionTable]
      .sort((a, b) => b.periodRevenue - a.periodRevenue || b.lifetimeSpend - a.lifetimeSpend)
      .slice(0, 15)

    // Customer Cohort Retention (Monthly Cohorts)
    const cohortMap = new Map<string, { cohortMonth: string; totalNew: Set<string>; monthReturns: Map<number, Set<string>> }>()
    for (const ord of allHistoricalOrders) {
      const custHist = customerHistMap.get(ord.customer_id)
      if (!custHist) continue

      const firstMonthStr = `${custHist.firstOrder.getFullYear()}-${String(custHist.firstOrder.getMonth() + 1).padStart(2, "0")}`
      if (!cohortMap.has(firstMonthStr)) {
        cohortMap.set(firstMonthStr, {
          cohortMonth: firstMonthStr,
          totalNew: new Set(),
          monthReturns: new Map(),
        })
      }

      const cohort = cohortMap.get(firstMonthStr)!
      cohort.totalNew.add(ord.customer_id)

      const orderMonthIndex =
        (ord.created_at.getFullYear() - custHist.firstOrder.getFullYear()) * 12 +
        (ord.created_at.getMonth() - custHist.firstOrder.getMonth())

      if (orderMonthIndex >= 0) {
        if (!cohort.monthReturns.has(orderMonthIndex)) {
          cohort.monthReturns.set(orderMonthIndex, new Set())
        }
        cohort.monthReturns.get(orderMonthIndex)!.add(ord.customer_id)
      }
    }

    const cohortRetention = Array.from(cohortMap.values())
      .sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth))
      .slice(0, 6)
      .map((ch) => {
        const initialSize = ch.totalNew.size
        const getRate = (mIndex: number) => {
          if (!ch.monthReturns.has(mIndex) || initialSize === 0) return null
          return Math.round((ch.monthReturns.get(mIndex)!.size / initialSize) * 100)
        }
        return {
          cohortMonth: ch.cohortMonth,
          size: initialSize,
          m0: 100,
          m1: getRate(1),
          m2: getRate(2),
          m3: getRate(3),
        }
      })

    // ─────────────────────────────────────────────────────────────
    // 5. SECTION 2: PRODUCT / MENU ANALYTICS & PROFITABILITY
    // ─────────────────────────────────────────────────────────────
    const productStatsMap = new Map<
      string,
      {
        id: string
        name: string
        categoryName: string
        unitsSold: number
        revenue: number
        ordersCount: Set<string>
        customerIds: Set<string>
        repeatCustomerIds: Set<string>
        multiItemOrdersCount: number
        cancelledCount: number
      }
    >()

    // Prepopulate map with active MenuItems to detect 0-sales items
    for (const item of allMenuItems) {
      productStatsMap.set(item.id, {
        id: item.id,
        name: item.name,
        categoryName: item.category?.name || "General",
        unitsSold: 0,
        revenue: 0,
        ordersCount: new Set(),
        customerIds: new Set(),
        repeatCustomerIds: new Set(),
        multiItemOrdersCount: 0,
        cancelledCount: 0,
      })
    }

    for (const order of validCurrent) {
      const orderItemCount = order.items.length
      const hasOtherItems = orderItemCount > 1

      for (const it of order.items) {
        let entry = productStatsMap.get(it.menu_item_id)
        if (!entry) {
          const mi = menuItemLookup.get(it.menu_item_id)
          entry = {
            id: it.menu_item_id,
            name: it.item_name_snapshot,
            categoryName: mi?.category?.name || "General",
            unitsSold: 0,
            revenue: 0,
            ordersCount: new Set(),
            customerIds: new Set(),
            repeatCustomerIds: new Set(),
            multiItemOrdersCount: 0,
            cancelledCount: 0,
          }
          productStatsMap.set(it.menu_item_id, entry)
        }

        entry.unitsSold += it.quantity
        entry.revenue += it.line_total
        entry.ordersCount.add(order.id)
        if (entry.customerIds.has(order.customer_id)) {
          entry.repeatCustomerIds.add(order.customer_id)
        } else {
          entry.customerIds.add(order.customer_id)
        }
        if (hasOtherItems) {
          entry.multiItemOrdersCount++
        }
      }
    }

    // Tally cancellations
    for (const order of allOrdersInPeriod) {
      if (order.status === "CANCELLED" || order.status === "REJECTED") {
        for (const it of order.items) {
          const entry = productStatsMap.get(it.menu_item_id)
          if (entry) entry.cancelledCount += it.quantity
        }
      }
    }

    // Previous period sales for product growth
    const prevProductRevenueMap = new Map<string, number>()
    for (const order of validPrev) {
      for (const it of order.items) {
        const curRev = prevProductRevenueMap.get(it.menu_item_id) || 0
        prevProductRevenueMap.set(it.menu_item_id, curRev + it.line_total)
      }
    }

    // Calculate Product Metrics
    const productList = Array.from(productStatsMap.values()).map((p) => {
      const units = p.unitsSold
      const rev = Math.round(p.revenue)
      const asp = units > 0 ? parseFloat((rev / units).toFixed(2)) : 0
      const penetration = currentOrderCount > 0 ? parseFloat(((p.ordersCount.size / currentOrderCount) * 100).toFixed(1)) : 0
      const contribution = grossSalesCurrent > 0 ? parseFloat(((rev / grossSalesCurrent) * 100).toFixed(1)) : 0
      const prevRev = prevProductRevenueMap.get(p.id) || 0
      const growth = calcGrowth(rev, prevRev)

      // Repeat Purchase Rate
      const buyersCount = p.customerIds.size
      const repeatBuyersCount = p.repeatCustomerIds.size
      const repeatPurchaseRate = buyersCount > 0 ? parseFloat(((repeatBuyersCount / buyersCount) * 100).toFixed(1)) : 0

      // Attach Rate
      const totalOrdersWithItem = p.ordersCount.size
      const attachRate = totalOrdersWithItem > 0 ? parseFloat(((p.multiItemOrdersCount / totalOrdersWithItem) * 100).toFixed(1)) : 0

      // Cancellation Rate
      const totalOrderedWithItem = units + p.cancelledCount
      const cancellationRate = totalOrderedWithItem > 0 ? parseFloat(((p.cancelledCount / totalOrderedWithItem) * 100).toFixed(1)) : 0

      // Recipe & Profitability
      const recipeInfo = recipeCostMap.get(p.id)
      const hasRecipe = recipeInfo?.hasRecipe || false
      const unitCost = hasRecipe ? recipeInfo!.cost : null
      const grossProfit = unitCost !== null && asp > 0 ? parseFloat((asp - unitCost).toFixed(2)) : null
      const grossMarginPercent = grossProfit !== null && asp > 0 ? parseFloat(((grossProfit / asp) * 100).toFixed(1)) : null
      const foodCostPercent = unitCost !== null && asp > 0 ? parseFloat(((unitCost / asp) * 100).toFixed(1)) : null
      const totalContribution = grossProfit !== null ? Math.round(grossProfit * units) : null

      // Product Lifecycle
      const mi = menuItemLookup.get(p.id)
      const createdAt = mi?.created_at ? new Date(mi.created_at) : new Date(0)
      const daysSinceCreation = Math.floor((nowMs - createdAt.getTime()) / (1000 * 60 * 60 * 24))

      let lifecycle = "STABLE"
      if (daysSinceCreation <= 30) {
        lifecycle = "NEW"
      } else if (growth !== null && growth > 15) {
        lifecycle = "GROWING"
      } else if (growth !== null && growth < -15) {
        lifecycle = "DECLINING"
      } else if (units === 0) {
        lifecycle = "AT_RISK"
      }

      return {
        id: p.id,
        name: p.name,
        categoryName: p.categoryName,
        unitsSold: units,
        revenue: rev,
        asp,
        ordersCount: p.ordersCount.size,
        penetration,
        contribution,
        growth,
        repeatPurchaseRate,
        attachRate,
        cancellationRate,
        lifecycle,
        unitCost: unitCost !== null ? parseFloat(unitCost.toFixed(2)) : null,
        grossProfit,
        grossMarginPercent,
        foodCostPercent,
        totalContribution,
        hasRecipe,
      }
    })

    // Compute Product Performance Matrix (Sales Volume x Margin)
    const activeProductsWithSales = productList.filter((p) => p.unitsSold > 0)
    const medianUnits =
      activeProductsWithSales.length > 0
        ? [...activeProductsWithSales].sort((a, b) => a.unitsSold - b.unitsSold)[Math.floor(activeProductsWithSales.length / 2)]?.unitsSold || 5
        : 5

    const productsWithMatrix = productList.map((p) => {
      const isHighMargin =
        p.grossMarginPercent !== null ? p.grossMarginPercent >= 60 : p.contribution >= 5
      const isHighVolume = p.unitsSold >= medianUnits

      let quadrant = "DOG"
      let quadrantLabel = "Underperformer"
      let actionSuggestion = "Low volume and profitability. Review recipe appeal or consider rotating."

      if (isHighVolume && isHighMargin) {
        quadrant = "STAR"
        quadrantLabel = "Star Product"
        actionSuggestion = "High sales and high margin! Ensure kitchen ingredients are never out of stock."
      } else if (isHighVolume && !isHighMargin) {
        quadrant = "CASH_COW"
        quadrantLabel = "Cash Cow"
        actionSuggestion = "Volume driver. Optimize portion weight by 5% to boost profitability."
      } else if (!isHighVolume && isHighMargin) {
        quadrant = "PUZZLE"
        quadrantLabel = "Opportunity"
        actionSuggestion = "High margin potential. Promote as chef's special or feature on menu banner."
      }

      return {
        ...p,
        quadrant,
        quadrantLabel,
        actionSuggestion,
      }
    })

    const topProductsByRevenue = [...productsWithMatrix].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    const topProductsByQuantity = [...productsWithMatrix].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10)

    // Category Performance
    const categoryStatsMap = new Map<string, { category: string; unitsSold: number; revenue: number; ordersCount: Set<string>; itemsCount: number }>()
    for (const p of productsWithMatrix) {
      const cat = p.categoryName || "General"
      const existing = categoryStatsMap.get(cat) || { category: cat, unitsSold: 0, revenue: 0, ordersCount: new Set(), itemsCount: 0 }
      existing.unitsSold += p.unitsSold
      existing.revenue += p.revenue
      existing.itemsCount++
      categoryStatsMap.set(cat, existing)
    }

    const categoryPerformance = Array.from(categoryStatsMap.values())
      .map((c) => ({
        category: c.category,
        unitsSold: c.unitsSold,
        revenue: Math.round(c.revenue),
        contribution: grossSalesCurrent > 0 ? parseFloat(((c.revenue / grossSalesCurrent) * 100).toFixed(1)) : 0,
        itemsCount: c.itemsCount,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // Product Growth Gainers & Decliners
    const productGrowthComparison = {
      gainers: [...productsWithMatrix]
        .filter((p) => p.growth !== null && p.growth > 0)
        .sort((a, b) => (b.growth || 0) - (a.growth || 0))
        .slice(0, 5),
      decliners: [...productsWithMatrix]
        .filter((p) => p.growth !== null && p.growth < 0)
        .sort((a, b) => (a.growth || 0) - (b.growth || 0))
        .slice(0, 5),
    }

    // Product Pairing / Frequently Bought Together
    const pairCounts = new Map<string, { itemA: string; itemB: string; count: number }>()
    for (const o of validCurrent) {
      const uniqueNames = Array.from(new Set(o.items.map((i) => i.item_name_snapshot)))
      for (let i = 0; i < uniqueNames.length; i++) {
        for (let j = i + 1; j < uniqueNames.length; j++) {
          const [a, b] = [uniqueNames[i], uniqueNames[j]].sort()
          const key = `${a} +++ ${b}`
          const existing = pairCounts.get(key)
          if (existing) {
            existing.count++
          } else {
            pairCounts.set(key, { itemA: a, itemB: b, count: 1 })
          }
        }
      }
    }
    const frequentlyBoughtTogether = Array.from(pairCounts.values())
      .map((p) => ({
        itemA: p.itemA,
        itemB: p.itemB,
        pairText: `${p.itemA} + ${p.itemB}`,
        count: p.count,
        pairingRate: currentOrderCount > 0 ? parseFloat(((p.count / currentOrderCount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Product Trends (Revenue and Units Timeline)
    const productTrends = customerGrowthTrend.map((t) => ({
      date: t.date,
      label: t.label,
      revenue: t.revenue,
      units: validCurrent
        .filter((o) => (isSingleDay ? String(new Date(o.created_at).getHours()) === t.date : o.created_at.toISOString().split("T")[0] === t.date))
        .reduce((sum, o) => sum + o.items.reduce((iSum, it) => iSum + it.quantity, 0), 0),
    }))

    const totalUnitsSold = productsWithMatrix.reduce((sum, p) => sum + p.unitsSold, 0)
    const prevUnitsSold = validPrev.reduce((sum, o) => sum + o.items.reduce((iSum, it) => iSum + it.quantity, 0), 0)
    const unitsSoldGrowth = calcGrowth(totalUnitsSold, prevUnitsSold)

    // Product Action Table
    const productActionTable = [...productsWithMatrix]
      .sort((a, b) => b.revenue - a.revenue)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.categoryName,
        lifecycle: p.lifecycle,
        unitsSold: p.unitsSold,
        revenue: p.revenue,
        contribution: p.contribution,
        foodCostPercent: p.foodCostPercent,
        grossMarginPercent: p.grossMarginPercent,
        repeatPurchaseRate: p.repeatPurchaseRate,
        attachRate: p.attachRate,
        suggestedAction: p.actionSuggestion,
      }))

    // ─────────────────────────────────────────────────────────────
    // 6. SECTION 3: INVENTORY, INGREDIENT IMPACT & WASTE ANALYTICS
    // ─────────────────────────────────────────────────────────────
    let totalInventoryValuation = 0
    let openingInventoryValuation = 0
    const lowStockItems: any[] = []
    const outOfStockItems: any[] = []

    for (const inv of allInventoryItems) {
      const q = Number(inv.quantity)
      const openingQ = Number(inv.opening_stock)
      const cost = inv.cost_per_unit ? Number(inv.cost_per_unit) : 0
      const minStock = Number(inv.minimum_stock)
      const reorderLvl = Number(inv.reorder_level)

      if (cost && q > 0) totalInventoryValuation += q * cost
      if (cost && openingQ > 0) openingInventoryValuation += openingQ * cost

      if (q <= 0) {
        outOfStockItems.push({
          id: inv.id,
          name: inv.name,
          quantity: q,
          unit: inv.unit,
          minimumStock: minStock,
          reorderLevel: reorderLvl,
          costPerUnit: cost,
        })
      } else if (q <= minStock) {
        lowStockItems.push({
          id: inv.id,
          name: inv.name,
          quantity: q,
          unit: inv.unit,
          minimumStock: minStock,
          reorderLevel: reorderLvl,
          costPerUnit: cost,
          shortfall: (minStock - q).toFixed(2),
        })
      }
    }

    // Period Transactions Breakdown
    let stockConsumedQty = 0
    let stockConsumedCost = 0
    let stockWastedQty = 0
    let stockWastedCost = 0
    let stockPurchasedQty = 0
    let stockPurchasedCost = 0

    const wasteByIngredientMap = new Map<string, { name: string; quantity: number; cost: number; unit: string }>()
    const wasteByReasonMap = new Map<string, { reason: string; count: number; cost: number }>()
    const consumptionByDateMap = new Map<string, { date: string; label: string; consumedQty: number; consumedCost: number; wasteCost: number }>()

    for (const tx of allPeriodTransactions) {
      const q = Number(tx.quantity)
      const cost = tx.total_cost ? Number(tx.total_cost) : tx.unit_cost ? Number(tx.unit_cost) * q : 0
      const dateStr = tx.created_at.toISOString().split("T")[0]

      if (!consumptionByDateMap.has(dateStr)) {
        consumptionByDateMap.set(dateStr, {
          date: dateStr,
          label: new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          consumedQty: 0,
          consumedCost: 0,
          wasteCost: 0,
        })
      }
      const dayData = consumptionByDateMap.get(dateStr)!

      if (tx.type === "ORDER_DEDUCTION") {
        stockConsumedQty += q
        stockConsumedCost += cost
        dayData.consumedQty += q
        dayData.consumedCost += cost
      } else if (tx.type === "WASTAGE") {
        stockWastedQty += q
        stockWastedCost += cost
        dayData.wasteCost += cost

        const ingName = tx.inventoryItem.name
        const existingIng = wasteByIngredientMap.get(ingName) || { name: ingName, quantity: 0, cost: 0, unit: tx.inventoryItem.unit }
        existingIng.quantity += q
        existingIng.cost += cost
        wasteByIngredientMap.set(ingName, existingIng)

        const reason = tx.reason?.trim() || "Unspecified Waste"
        const existingReason = wasteByReasonMap.get(reason) || { reason, count: 0, cost: 0 }
        existingReason.count++
        existingReason.cost += cost
        wasteByReasonMap.set(reason, existingReason)
      } else if (tx.type === "PURCHASE") {
        stockPurchasedQty += q
        stockPurchasedCost += cost
      } else if (tx.type === "REVERSAL") {
        stockConsumedQty = Math.max(0, stockConsumedQty - q)
        stockConsumedCost = Math.max(0, stockConsumedCost - cost)
      }
    }

    let prevPurchasedCost = 0
    let prevConsumedCost = 0
    let prevWastedCost = 0
    for (const tx of prevPeriodTransactions) {
      const q = Number(tx.quantity)
      const cost = tx.total_cost ? Number(tx.total_cost) : tx.unit_cost ? Number(tx.unit_cost) * q : 0
      if (tx.type === "PURCHASE") prevPurchasedCost += cost
      if (tx.type === "ORDER_DEDUCTION") prevConsumedCost += cost
      if (tx.type === "WASTAGE") prevWastedCost += cost
    }

    const purchasedCostGrowth = calcGrowth(stockPurchasedCost, prevPurchasedCost)
    const consumedCostGrowth = calcGrowth(stockConsumedCost, prevConsumedCost)
    const wastedCostGrowth = calcGrowth(stockWastedCost, prevWastedCost)

    const wastePercent =
      stockConsumedCost + stockWastedCost > 0
        ? parseFloat(((stockWastedCost / (stockConsumedCost + stockWastedCost)) * 100).toFixed(1))
        : 0

    // Inventory Turnover = COGS consumption cost / Average Inventory Value
    const avgInventoryValuation = (openingInventoryValuation + totalInventoryValuation) / 2 || totalInventoryValuation
    const inventoryTurnover = avgInventoryValuation > 0
      ? parseFloat((stockConsumedCost / avgInventoryValuation).toFixed(2))
      : null

    // Stockout rate = outOfStock / totalItems * 100
    const stockoutRate = allInventoryItems.length > 0
      ? parseFloat(((outOfStockItems.length / allInventoryItems.length) * 100).toFixed(1))
      : 0

    // GMROI (Gross Margin Return on Inventory)
    const gmroi = currentGrossProfit !== null && avgInventoryValuation > 0
      ? parseFloat((currentGrossProfit / avgInventoryValuation).toFixed(2))
      : null

    // Expected vs Actual Consumption (for menu items with recipe ingredients)
    const expectedIngredientConsumption = new Map<
      string,
      {
        id: string
        name: string
        unit: string
        expectedQty: number
        actualQty: number
        costPerUnit: number
      }
    >()

    for (const inv of allInventoryItems) {
      expectedIngredientConsumption.set(inv.id, {
        id: inv.id,
        name: inv.name,
        unit: inv.unit,
        expectedQty: 0,
        actualQty: 0,
        costPerUnit: inv.cost_per_unit ? Number(inv.cost_per_unit) : 0,
      })
    }

    for (const p of productsWithMatrix) {
      const mi = menuItemLookup.get(p.id)
      if (mi && mi.ingredients) {
        for (const ing of mi.ingredients) {
          const entry = expectedIngredientConsumption.get(ing.inventory_item_id)
          if (entry) {
            entry.expectedQty += p.unitsSold * Number(ing.quantity)
          }
        }
      }
    }

    for (const tx of allPeriodTransactions) {
      if (tx.type === "ORDER_DEDUCTION") {
        const entry = expectedIngredientConsumption.get(tx.inventory_item_id)
        if (entry) {
          entry.actualQty += Number(tx.quantity)
        }
      }
    }

    const consumptionVariance = Array.from(expectedIngredientConsumption.values())
      .filter((c) => c.expectedQty > 0 || c.actualQty > 0)
      .map((c) => {
        const variance = c.actualQty - c.expectedQty
        const variancePercent = c.expectedQty > 0 ? parseFloat(((variance / c.expectedQty) * 100).toFixed(1)) : null
        const varianceCost = Math.round(variance * c.costPerUnit)
        return {
          id: c.id,
          name: c.name,
          unit: c.unit,
          expectedQty: parseFloat(c.expectedQty.toFixed(2)),
          actualQty: parseFloat(c.actualQty.toFixed(2)),
          variance: parseFloat(variance.toFixed(2)),
          variancePercent,
          varianceCost,
          status:
            variancePercent === null
              ? "Unlinked Recipe"
              : variancePercent > 5
              ? "Over-portioned / Leakage"
              : variancePercent < -5
              ? "Under-reported"
              : "Optimal",
        }
      })
      .sort((a, b) => (b.variancePercent || 0) - (a.variancePercent || 0))

    // Days of Inventory Remaining & Reorder Analysis
    const reorderAnalysis = allInventoryItems.map((inv) => {
      const q = Number(inv.quantity)
      const reorderLvl = Number(inv.reorder_level)
      const minStock = Number(inv.minimum_stock)
      const consumedInPeriod = allPeriodTransactions
        .filter((t) => t.inventory_item_id === inv.id && t.type === "ORDER_DEDUCTION")
        .reduce((sum, t) => sum + Number(t.quantity), 0)

      const avgDailyConsumption = consumedInPeriod / daysInPeriod
      const daysRemaining = avgDailyConsumption > 0 ? parseFloat((q / avgDailyConsumption).toFixed(1)) : null

      const isStockoutRisk = (daysRemaining !== null && daysRemaining <= 3) || q <= reorderLvl
      const suggestedReorder = isStockoutRisk ? Math.max(0, reorderLvl * 2 - q) : 0

      return {
        id: inv.id,
        name: inv.name,
        unit: inv.unit,
        currentStock: q,
        reorderLevel: reorderLvl,
        minimumStock: minStock,
        costPerUnit: inv.cost_per_unit ? Number(inv.cost_per_unit) : null,
        consumedInPeriod: parseFloat(consumedInPeriod.toFixed(2)),
        avgDailyConsumption: parseFloat(avgDailyConsumption.toFixed(2)),
        daysRemaining,
        isStockoutRisk,
        suggestedReorder: parseFloat(suggestedReorder.toFixed(2)),
      }
    })

    const stockoutApproaching = reorderAnalysis
      .filter((r) => r.isStockoutRisk)
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))

    // ─────────────────────────────────────────────────────────────
    // INGREDIENT -> PRODUCT IMPACT ANALYSIS
    // ─────────────────────────────────────────────────────────────
    const ingredientProductImpact = stockoutApproaching.map((item) => {
      // Find all menu items that depend on this ingredient
      const affectedMenuItems = allMenuItems.filter((m) =>
        m.ingredients?.some((ing) => ing.inventory_item_id === item.id)
      )

      const dishNames = affectedMenuItems.map((m) => m.name)

      // Calculate servings remaining based on smallest recipe requirement
      let minServings = 999
      let dailyAffectedRevenue = 0

      for (const m of affectedMenuItems) {
        const ingLink = m.ingredients?.find((i) => i.inventory_item_id === item.id)
        if (ingLink && Number(ingLink.quantity) > 0) {
          const possibleServings = Math.floor(item.currentStock / Number(ingLink.quantity))
          if (possibleServings < minServings) minServings = possibleServings
        }

        const prodStat = productStatsMap.get(m.id)
        if (prodStat && daysInPeriod > 0) {
          dailyAffectedRevenue += prodStat.revenue / daysInPeriod
        }
      }

      if (minServings === 999) minServings = 0
      const daysShortfall = item.daysRemaining !== null ? Math.max(0, 3 - item.daysRemaining) : 2
      const salesAtRisk = Math.round(dailyAffectedRevenue * Math.max(1, daysShortfall))

      return {
        ingredientId: item.id,
        name: item.name,
        currentStock: item.currentStock,
        unit: item.unit,
        daysRemaining: item.daysRemaining,
        dishesAffected: dishNames,
        dishesCount: dishNames.length,
        servingsRemaining: minServings,
        salesAtRisk,
        reorderLevel: item.reorderLevel,
        suggestedReorder: item.suggestedReorder,
        reorderStatus: item.currentStock <= 0 ? "OUT_OF_STOCK" : item.daysRemaining !== null && item.daysRemaining <= 2 ? "CRITICAL" : "REORDER_SOON",
      }
    })

    // Inventory Action Table
    const inventoryActionTable = allInventoryItems.map((inv) => {
      const q = Number(inv.quantity)
      const reorderAnalysisItem = reorderAnalysis.find((r) => r.id === inv.id)
      const varianceItem = consumptionVariance.find((v) => v.id === inv.id)
      const wastedItem = wasteByIngredientMap.get(inv.name)

      const daysRem = reorderAnalysisItem?.daysRemaining ?? null
      let reorderStatus = "HEALTHY"
      let priority = "LOW"
      let suggestedAction = "Stock level healthy"

      if (q <= 0) {
        reorderStatus = "OUT_OF_STOCK"
        priority = "HIGH"
        suggestedAction = `Immediate purchase needed (${reorderAnalysisItem?.suggestedReorder || inv.reorder_level} ${inv.unit})`
      } else if (daysRem !== null && daysRem <= 3) {
        reorderStatus = "CRITICAL"
        priority = "HIGH"
        suggestedAction = `Place order today (~${daysRem} days remaining)`
      } else if (q <= Number(inv.minimum_stock)) {
        reorderStatus = "LOW_STOCK"
        priority = "MEDIUM"
        suggestedAction = `Below minimum stock (${inv.minimum_stock} ${inv.unit})`
      } else if (varianceItem && varianceItem.variancePercent !== null && varianceItem.variancePercent > 10) {
        reorderStatus = "LEAKAGE_RISK"
        priority = "MEDIUM"
        suggestedAction = `Audit portion control (+${varianceItem.variancePercent}% variance)`
      }

      return {
        id: inv.id,
        name: inv.name,
        unit: inv.unit,
        currentStock: q,
        daysRemaining: daysRem !== null ? `${daysRem} days` : "No usage",
        consumption: reorderAnalysisItem ? `${reorderAnalysisItem.consumedInPeriod} ${inv.unit}` : "0",
        variance: varianceItem?.variancePercent !== null && varianceItem?.variancePercent !== undefined ? `${varianceItem.variancePercent > 0 ? "+" : ""}${varianceItem.variancePercent}%` : "0%",
        wasteCost: wastedItem ? `₹${Math.round(wastedItem.cost).toLocaleString()}` : "₹0",
        reorderStatus,
        priority,
        suggestedAction,
      }
    })

    // Waste arrays
    const wasteByIngredient = Array.from(wasteByIngredientMap.values())
      .map((w) => ({
        name: w.name,
        quantity: parseFloat(w.quantity.toFixed(2)),
        cost: Math.round(w.cost),
        unit: w.unit,
      }))
      .sort((a, b) => b.cost - a.cost)

    const wasteByReason = Array.from(wasteByReasonMap.values())
      .map((r) => ({
        reason: r.reason,
        count: r.count,
        cost: Math.round(r.cost),
      }))
      .sort((a, b) => b.cost - a.cost)

    const inventoryConsumptionTrend = Array.from(consumptionByDateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    // ─────────────────────────────────────────────────────────────
    // 7. OWNER ALERTS & BUSINESS INSIGHTS
    // Format: Issue -> Cause -> Financial/Business Impact -> Recommended Action -> Priority
    // ─────────────────────────────────────────────────────────────
    const ownerAlerts: Array<{
      id: string
      priority: "HIGH" | "MEDIUM" | "LOW"
      badge: string
      issue: string
      cause: string
      financialImpact: string
      recommendedAction: string
      actionLink?: string
    }> = []

    // 1. Sales Trend Alert
    if (grossSalesGrowth !== null) {
      if (grossSalesGrowth < -5) {
        ownerAlerts.push({
          id: "alert-sales-decline",
          priority: "HIGH",
          badge: "📉 Sales Drop",
          issue: `Gross Sales Below Normal Trend (${grossSalesGrowth}%)`,
          cause: `Valid order revenue dropped compared to the previous equivalent period (₹${Math.round(grossSalesCurrent).toLocaleString()} vs ₹${Math.round(grossSalesPrev).toLocaleString()}).`,
          financialImpact: `₹${Math.round(grossSalesPrev - grossSalesCurrent).toLocaleString()} lower revenue intake.`,
          recommendedAction: "Dispatch a targeted promotional offer to regular customers via Customer Offers.",
          actionLink: "/customers/offers",
        })
      } else if (grossSalesGrowth > 10) {
        ownerAlerts.push({
          id: "alert-sales-growth",
          priority: "LOW",
          badge: "📈 Strong Growth",
          issue: `Sales Revenue Surged by +${grossSalesGrowth}%`,
          cause: `Customer order velocity and ticket sizes accelerated vs previous period (₹${Math.round(grossSalesCurrent).toLocaleString()} vs ₹${Math.round(grossSalesPrev).toLocaleString()}).`,
          financialImpact: `+₹${Math.round(grossSalesCurrent - grossSalesPrev).toLocaleString()} added top-line revenue.`,
          recommendedAction: "Review inventory stock cover to support higher sales velocity.",
          actionLink: "/inventory",
        })
      }
    }

    // 2. High-Value Customers Becoming Inactive
    if (segmentCounts.AT_RISK > 0) {
      ownerAlerts.push({
        id: "alert-at-risk-custs",
        priority: "HIGH",
        badge: "⚠️ Retention Risk",
        issue: `${segmentCounts.AT_RISK} High-Value Customers Inactive (>30 Days)`,
        cause: "Previously frequent or high-spending diners have not placed an order in over 30 days.",
        financialImpact: `Up to ₹${Math.round(atRiskSpendTotal).toLocaleString()} in customer lifetime value at risk of permanent churn.`,
        recommendedAction: "Send automated 'We miss you' WhatsApp voucher before 60-day permanent churn threshold.",
        actionLink: "/customers/offers",
      })
    }

    // 3. Popular Product Declining
    if (productGrowthComparison.decliners.length > 0) {
      const topDecliner = productGrowthComparison.decliners[0]
      if (topDecliner.growth !== null && topDecliner.growth < -20) {
        const estLoss = Math.round(topDecliner.revenue * (Math.abs(topDecliner.growth) / 100))
        ownerAlerts.push({
          id: "alert-product-declining",
          priority: "MEDIUM",
          badge: "📉 Dish Decline",
          issue: `Popular Dish "${topDecliner.name}" Sales Dropped ${topDecliner.growth}%`,
          cause: "Order frequency for this dish slowed significantly compared to the prior period.",
          financialImpact: `~₹${estLoss.toLocaleString()} lost sales on this specific item.`,
          recommendedAction: "Verify preparation quality with the kitchen team or feature on social media.",
          actionLink: "/menu",
        })
      }
    }

    // 4. Critical Ingredient Stockout Imminent
    if (ingredientProductImpact.length > 0) {
      const urgentItem = ingredientProductImpact[0]
      ownerAlerts.push({
        id: "alert-stockout-risk",
        priority: "HIGH",
        badge: "🥫 Stockout Risk",
        issue: `Critical Stockout Imminent: "${urgentItem.name}"`,
        cause: `Current stock of ${urgentItem.currentStock} ${urgentItem.unit} covers only ~${urgentItem.daysRemaining ?? "few"} days.`,
        financialImpact: `Disrupts ${urgentItem.dishesCount} menu items, placing ₹${urgentItem.salesAtRisk.toLocaleString()} in potential dish sales at risk.`,
        recommendedAction: `Reorder approximately ${urgentItem.suggestedReorder || urgentItem.reorderLevel} ${urgentItem.unit} immediately.`,
        actionLink: "/inventory",
      })
    }

    // 5. Abnormally High Kitchen Waste
    if (wasteByIngredient.length > 0 && wasteByIngredient[0].cost > 0) {
      const highestWaste = wasteByIngredient[0]
      ownerAlerts.push({
        id: "alert-high-waste",
        priority: highestWaste.cost > 1000 ? "HIGH" : "MEDIUM",
        badge: "🗑️ Waste Cost",
        issue: `Abnormally High Waste on "${highestWaste.name}" (₹${highestWaste.cost.toLocaleString()})`,
        cause: `${highestWaste.quantity} ${highestWaste.unit} was recorded as kitchen waste in this period.`,
        financialImpact: `Direct profit margin reduction of ₹${highestWaste.cost.toLocaleString()}.`,
        recommendedAction: "Audit kitchen prep batch sizes and inspect cold-storage refrigeration temperatures.",
        actionLink: "/inventory",
      })
    }

    // 6. High-Margin Product With Weak Sales (Opportunity)
    const opportunityProduct = productsWithMatrix.find((p) => p.quadrant === "PUZZLE" && p.grossMarginPercent !== null && p.grossMarginPercent >= 65)
    if (opportunityProduct) {
      ownerAlerts.push({
        id: "alert-high-margin-opportunity",
        priority: "MEDIUM",
        badge: "💡 Profit Opportunity",
        issue: `High-Margin Dish "${opportunityProduct.name}" Has Weak Sales`,
        cause: `Only ${opportunityProduct.unitsSold} units sold despite an exceptional ${opportunityProduct.grossMarginPercent}% gross margin.`,
        financialImpact: "Missed high-margin revenue contribution that could substantially expand net profits.",
        recommendedAction: "Feature as 'Chef's Special' on WhatsApp catalog and train staff to suggest it as an add-on.",
        actionLink: "/menu",
      })
    }

    // 7. Low-Margin Product Consuming Significant Stock (Cash Cow Optimization)
    const thinMarginCow = productsWithMatrix.find((p) => p.quadrant === "CASH_COW" && p.grossMarginPercent !== null && p.grossMarginPercent < 45)
    if (thinMarginCow) {
      ownerAlerts.push({
        id: "alert-low-margin-high-volume",
        priority: "MEDIUM",
        badge: "⚖️ Margin Squeeze",
        issue: `Volume Leader "${thinMarginCow.name}" Operates on Low Margin (${thinMarginCow.grossMarginPercent}%)`,
        cause: `Generates high order volume (${thinMarginCow.unitsSold} units sold) but recipe food costs absorb most revenue.`,
        financialImpact: "Kitchen workload is high with minimal net retained profit per serving.",
        recommendedAction: "Optimize portion weight by 5-10% or adjust price by ₹10-20 to improve gross margin.",
        actionLink: "/menu",
      })
    }

    // ─────────────────────────────────────────────────────────────
    // 8. UNIFIED BI RESPONSE PAYLOAD
    // ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      period: {
        range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        prevStartDate: prevStartDate.toISOString(),
        prevEndDate: prevEndDate.toISOString(),
        daysInPeriod,
      },

      // Owner Alerts / Business Insights (Strict Issue -> Cause -> Impact -> Action -> Priority)
      ownerAlerts,

      // 1. OWNER EXECUTIVE OVERVIEW
      overview: {
        grossSales: { value: Math.round(grossSalesCurrent), prev: Math.round(grossSalesPrev), growth: grossSalesGrowth },
        netSales: { value: Math.round(netSalesCurrent), prev: Math.round(netSalesPrev), growth: netSalesGrowth },
        totalOrders: { value: currentOrderCount, prev: prevOrderCount, growth: orderCountGrowth },
        aov: { value: parseFloat(currentAOV.toFixed(2)), prev: parseFloat(prevAOV.toFixed(2)), growth: aovGrowth },
        uniqueCustomers: { value: totalActiveCustomers, prev: prevActiveCustomers, growth: customerGrowth },
        newCustomers: { value: newCustomersCount },
        repeatCustomers: { value: returningCustomersCount },
        repeatCustomerRate: { value: repeatCustomerRate },
        grossProfit: { value: currentGrossProfit, prev: prevGrossProfit, growth: grossProfitGrowth },
        contributionMargin: { value: currentContributionMargin },
        foodCostPercent: { value: currentFoodCostPercent },
        inventoryValuation: { value: Math.round(totalInventoryValuation) },
        wasteCost: { value: Math.round(stockWastedCost), prev: Math.round(prevWastedCost), growth: wastedCostGrowth },
        wastePercent: { value: wastePercent },
        stockoutLostSales: { value: null, label: "N/A", note: "Stockout loss tracking not configured in POS" },
        whatsAppOrders: { value: whatsAppOrdersCount, prev: whatsAppOrdersPrev.length, growth: whatsAppOrdersGrowth },
        whatsAppConversionRate: { value: whatsAppConversionRate },
        salesVsTarget: { value: null, label: "N/A", note: "No target configured in settings" },
        todayVsYesterday: {
          todaySales: Math.round(todaySales),
          yesterdaySales: Math.round(yesterdaySales),
          salesGrowth: todaySalesGrowth,
          todayOrders: todayOrderCount,
          yesterdayOrders: yesterdayOrderCount,
          ordersGrowth: todayOrdersGrowth,
          todayAov: todayAOV,
          yesterdayAov: yesterdayAOV,
          aovGrowth: todayAovGrowth,
        },
        cancelledOrders: { value: totalCancelledOrRejected, rate: allOrdersInPeriod.length > 0 ? parseFloat(((totalCancelledOrRejected / allOrdersInPeriod.length) * 100).toFixed(1)) : 0 },
        lostRevenue: { value: Math.round(lostRevenue) },
      },

      // 2. CUSTOMER ANALYTICS
      customers: {
        totalActiveCustomers,
        newCustomersCount,
        returningCustomersCount,
        repeatCustomerRate,
        customerRetentionRate,
        orderFrequency,
        avgItemsPerOrder,
        aov: parseFloat(currentAOV.toFixed(2)),
        revenuePerCustomer,
        ordersPerCustomer,
        totalCustomerRevenue: Math.round(grossSalesCurrent),
        avgCustomerLtv,
        churnRate: customerChurnRate,
        reactivatedCustomers: reactivatedCustomersCount,
        dormantCustomers: dormantCustomersCount,
        avgReorderGapDays,
        timeBasedRetention: {
          firstTimeCustomers: newCustomersCount,
          secondOrderConversionRate,
          thirdOrderConversionRate,
          repeatRate7Days,
          repeatRate30Days,
          repeatRate60Days,
          repeatRate90Days,
          avgDaysFirstToSecond,
        },
        orderFunnel,
        reorderGapDistribution,
        preferences: {
          favouriteDish,
          favouriteCategory,
          vegPreference,
          preferredOrderType: ordersByOrderType[0] || null,
          preferredDay: [...dayOfWeekStats].sort((a, b) => b.orders - a.orders)[0]?.day || "N/A",
          peakHourText,
        },
        growth: {
          activeCustomers: customerGrowth,
          revenue: grossSalesGrowth,
          orders: orderCountGrowth,
          aov: aovGrowth,
        },
        growthTrend: customerGrowthTrend,
        dayOfWeekStats,
        hourlyStats,
        peakHourText,
        ordersBySource,
        ordersByOrderType,
        locationStats,
        loyaltyComparison,
        segments: segmentCounts,
        topCustomers,
        customerActionTable,
        cohortRetention,
      },

      // 3. PRODUCT / MENU ANALYTICS
      products: {
        totalUnitsSold,
        totalRevenue: Math.round(grossSalesCurrent),
        averageSellingPrice: totalUnitsSold > 0 ? parseFloat((grossSalesCurrent / totalUnitsSold).toFixed(2)) : 0,
        growth: {
          unitsSold: unitsSoldGrowth,
          revenue: grossSalesGrowth,
        },
        trends: productTrends,
        topByRevenue: topProductsByRevenue,
        topByQuantity: topProductsByQuantity,
        categoryPerformance,
        growthComparison: productGrowthComparison,
        performanceMatrix: productsWithMatrix,
        frequentlyBoughtTogether,
        productActionTable,
        variants: {
          available: false,
          count: allMenuItems.reduce((s, m) => s + (m.variants?.length || 0), 0),
          message: "No item variants configured in Menu",
        },
        addons: {
          available: false,
          count: allMenuItems.reduce((s, m) => s + (m.addons?.length || 0), 0),
          message: "No add-ons configured in Menu",
          attachRate: 0,
        },
      },

      // 4. INVENTORY & WASTE ANALYTICS
      inventory: {
        valuation: Math.round(totalInventoryValuation),
        openingValuation: Math.round(openingInventoryValuation),
        totalItemsCount: allInventoryItems.length,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        purchasedQty: parseFloat(stockPurchasedQty.toFixed(2)),
        purchasedCost: Math.round(stockPurchasedCost),
        purchasedCostGrowth,
        consumedQty: parseFloat(stockConsumedQty.toFixed(2)),
        consumedCost: Math.round(stockConsumedCost),
        consumedCostGrowth,
        wastedQty: parseFloat(stockWastedQty.toFixed(2)),
        wastedCost: Math.round(stockWastedCost),
        wastedCostGrowth,
        wastePercent,
        inventoryTurnover,
        daysOfStockCover: reorderAnalysis.filter((r) => r.daysRemaining !== null).length > 0
          ? parseFloat((reorderAnalysis.reduce((s, r) => s + (r.daysRemaining || 0), 0) / Math.max(1, reorderAnalysis.filter((r) => r.daysRemaining !== null).length)).toFixed(1))
          : null,
        stockoutRate,
        gmroi,
        expiryRisk: { value: null, label: "N/A", note: "Expiry dates not tracked in inventory schema" },
        purchasePriceVariance: { value: null, label: "N/A", note: "Baseline PO pricing not tracked in schema" },
        consumptionVariance,
        stockoutApproaching,
        reorderAnalysis,
        ingredientProductImpact,
        inventoryActionTable,
        wasteByIngredient,
        wasteByReason,
        consumptionTrend: inventoryConsumptionTrend,
        lowStockItems,
        outOfStockItems,
      },

      // Operational Status Counts & Recent Orders
      statusCounts,
      recentOrders: allOrdersInPeriod.slice(0, 5).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name_snapshot,
        total: o.total,
        payment_method: o.payment_method,
        status: o.status,
        created_at: o.created_at,
      })),
    })
  } catch (error: any) {
    console.error("Dashboard Analytics Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
