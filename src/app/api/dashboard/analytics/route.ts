import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Safe Growth calculation: (Current - Prev) / Prev * 100
// Returns null if prev is 0 (frontend displays N/A, never Infinity or 100%)
function calcGrowth(curr: number, prev: number): number | null {
  if (prev === 0) return null
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

    // ─────────────────────────────────────────────────────────────
    // 1. CONCURRENT BATCH DATABASE READS (ZERO N+1 QUERIES)
    // ─────────────────────────────────────────────────────────────
    const [
      allOrdersInPeriod,
      prevOrdersInPeriod,
      allHistoricalOrders,
      allMenuItems,
      allInventoryItems,
      allPeriodTransactions,
      prevPeriodTransactions,
    ] = await Promise.all([
      // Current Period Orders (including items and customer)
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

      // All Historical Valid Orders for this Restaurant (for Lifetime Value, Cohorts, RFM, Segments)
      prisma.order.findMany({
        where: {
          restaurant_id: restaurantId,
          ...branchScope,
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        select: {
          id: true,
          customer_id: true,
          customer_name_snapshot: true,
          customer_phone_snapshot: true,
          total: true,
          created_at: true,
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

      // All Active Inventory Items (current stock and valuations)
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
    ])

    // Filter valid (non-cancelled, non-rejected) orders
    const validCurrent = allOrdersInPeriod.filter((o) => o.status !== "CANCELLED" && o.status !== "REJECTED")
    const validPrev = prevOrdersInPeriod.filter((o) => o.status !== "CANCELLED" && o.status !== "REJECTED")

    // ─────────────────────────────────────────────────────────────
    // 2. CORE FINANCIAL & OPERATIONAL KPIS
    // ─────────────────────────────────────────────────────────────
    const currentRevenue = validCurrent.reduce((acc, o) => acc + o.total, 0)
    const prevRevenue = validPrev.reduce((acc, o) => acc + o.total, 0)
    const revenueGrowth = calcGrowth(currentRevenue, prevRevenue)

    const currentOrderCount = validCurrent.length
    const prevOrderCount = validPrev.length
    const orderCountGrowth = calcGrowth(currentOrderCount, prevOrderCount)

    const currentAOV = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0
    const prevAOV = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0
    const aovGrowth = calcGrowth(currentAOV, prevAOV)

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
    // 3. SECTION 1: CUSTOMER ANALYTICS
    // ─────────────────────────────────────────────────────────────
    // Map all historical valid orders per customer
    const customerHistMap = new Map<
      string,
      {
        id: string
        name: string
        phone: string
        firstOrder: Date
        lastOrder: Date
        ordersCount: number
        totalSpend: number
      }
    >()

    for (const ord of allHistoricalOrders) {
      const existing = customerHistMap.get(ord.customer_id)
      if (!existing) {
        customerHistMap.set(ord.customer_id, {
          id: ord.customer_id,
          name: ord.customer_name_snapshot,
          phone: ord.customer_phone_snapshot,
          firstOrder: ord.created_at,
          lastOrder: ord.created_at,
          ordersCount: 1,
          totalSpend: ord.total,
        })
      } else {
        existing.lastOrder = ord.created_at
        existing.ordersCount++
        existing.totalSpend += ord.total
      }
    }

    const currentCustomerIds = Array.from(new Set(validCurrent.map((o) => o.customer_id)))
    const prevCustomerIds = new Set(validPrev.map((o) => o.customer_id))

    let newCustomersCount = 0
    let returningCustomersCount = 0
    let retainedFromPrevCount = 0

    for (const cId of currentCustomerIds) {
      const hist = customerHistMap.get(cId)
      if (hist && hist.firstOrder >= startDate && hist.firstOrder <= endDate) {
        newCustomersCount++
      } else {
        returningCustomersCount++
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
      totalActiveCustomers > 0 ? (returningCustomersCount / totalActiveCustomers) * 100 : 0

    // Customer retention rate: Customers from previous period who ordered again in current period / prevActiveCustomers * 100
    const customerRetentionRate =
      prevActiveCustomers > 0 ? (retainedFromPrevCount / prevActiveCustomers) * 100 : null

    // Revenue & Orders per Customer
    const revenuePerCustomer = totalActiveCustomers > 0 ? currentRevenue / totalActiveCustomers : 0
    const ordersPerCustomer = totalActiveCustomers > 0 ? currentOrderCount / totalActiveCustomers : 0

    // Average Customer Lifetime Value (LTV) across active customers in this period
    let totalLtvSum = 0
    for (const cId of currentCustomerIds) {
      const hist = customerHistMap.get(cId)
      if (hist) totalLtvSum += hist.totalSpend
    }
    const avgCustomerLtv = totalActiveCustomers > 0 ? totalLtvSum / totalActiveCustomers : 0

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

    // Initialize trend buckets based on date duration
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
      percent: currentRevenue > 0 ? parseFloat(((s.revenue / currentRevenue) * 100).toFixed(1)) : 0,
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
      percent: currentRevenue > 0 ? parseFloat(((t.revenue / currentRevenue) * 100).toFixed(1)) : 0,
    }))

    // Customer Location / Area Performance (extract from delivery_address_snapshot)
    const areaMap = new Map<string, { area: string; orders: number; revenue: number }>()
    for (const o of validCurrent) {
      if (o.delivery_address_snapshot && o.delivery_address_snapshot.trim()) {
        const parts = o.delivery_address_snapshot.split(",")
        const areaCandidate =
          parts.length >= 2 ? parts[parts.length - 2].trim() : parts[0].trim()
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

    // Loyalty Customers vs Non-Loyalty Customers
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

    // Customer RFM & Segmentation
    // Recency = days since last order
    // Frequency = number of valid orders
    // Monetary = total valid customer spend
    const nowMs = now.getTime()
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

    const topCustomersList: any[] = []

    for (const c of allCustomersList) {
      const daysSinceLastOrder = Math.max(0, Math.floor((nowMs - c.lastOrder.getTime()) / (1000 * 60 * 60 * 24)))
      let segment = "REGULAR"

      if (c.ordersCount >= 1 && c.totalSpend >= spendThreshold80) {
        segment = "HIGH_VALUE"
        segmentCounts.HIGH_VALUE++
      } else if (c.ordersCount >= 5 && daysSinceLastOrder <= 30) {
        segment = "LOYAL"
        segmentCounts.LOYAL++
      } else if (c.ordersCount === 1 && daysSinceLastOrder <= 30) {
        segment = "NEW"
        segmentCounts.NEW++
      } else if (c.ordersCount >= 2 && daysSinceLastOrder > 60) {
        segment = "CHURNED"
        segmentCounts.CHURNED++
      } else if (c.ordersCount >= 2 && daysSinceLastOrder > 30) {
        segment = "AT_RISK"
        segmentCounts.AT_RISK++
      } else {
        segment = "REGULAR"
        segmentCounts.REGULAR++
      }

      // Check spend in current period
      const currentPeriodOrders = validCurrent.filter((o) => o.customer_id === c.id)
      const currentPeriodRevenue = currentPeriodOrders.reduce((sum, o) => sum + o.total, 0)

      if (currentPeriodOrders.length > 0) {
        topCustomersList.push({
          id: c.id,
          name: c.name || "Customer",
          phone: c.phone,
          orders: currentPeriodOrders.length,
          revenue: Math.round(currentPeriodRevenue),
          aov: Math.round(currentPeriodRevenue / currentPeriodOrders.length),
          lifetimeOrders: c.ordersCount,
          lifetimeSpend: Math.round(c.totalSpend),
          lastOrder: c.lastOrder,
          daysSinceLast: daysSinceLastOrder,
          segment,
        })
      }
    }

    const topCustomers = topCustomersList.sort((a, b) => b.revenue - a.revenue).slice(0, 10)

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

      // Month difference between order and cohort acquisition
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
    // 4. SECTION 2: PRODUCT ANALYTICS
    // ─────────────────────────────────────────────────────────────
    // Build recipe cost lookup from active MenuItems
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

    // Aggregate Current Period Product Sales
    const productStatsMap = new Map<
      string,
      {
        id: string
        name: string
        categoryName: string
        unitsSold: number
        revenue: number
        ordersCount: Set<string>
      }
    >()

    for (const order of validCurrent) {
      for (const it of order.items) {
        const existing = productStatsMap.get(it.menu_item_id)
        if (existing) {
          existing.unitsSold += it.quantity
          existing.revenue += it.line_total
          existing.ordersCount.add(order.id)
        } else {
          const mi = menuItemLookup.get(it.menu_item_id)
          productStatsMap.set(it.menu_item_id, {
            id: it.menu_item_id,
            name: it.item_name_snapshot,
            categoryName: mi?.category?.name || "General",
            unitsSold: it.quantity,
            revenue: it.line_total,
            ordersCount: new Set([order.id]),
          })
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

    const productList = Array.from(productStatsMap.values()).map((p) => {
      const units = p.unitsSold
      const rev = Math.round(p.revenue)
      const asp = units > 0 ? parseFloat((rev / units).toFixed(2)) : 0
      const penetration = currentOrderCount > 0 ? parseFloat(((p.ordersCount.size / currentOrderCount) * 100).toFixed(1)) : 0
      const contribution = currentRevenue > 0 ? parseFloat(((rev / currentRevenue) * 100).toFixed(1)) : 0
      const prevRev = prevProductRevenueMap.get(p.id) || 0
      const growth = calcGrowth(rev, prevRev)

      const recipeInfo = recipeCostMap.get(p.id)
      const hasRecipe = recipeInfo?.hasRecipe || false
      const unitCost = hasRecipe ? recipeInfo!.cost : null
      const grossProfit = unitCost !== null && asp > 0 ? asp - unitCost : null
      const grossMarginPercent = grossProfit !== null && asp > 0 ? parseFloat(((grossProfit / asp) * 100).toFixed(1)) : null

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
        unitCost: unitCost !== null ? parseFloat(unitCost.toFixed(2)) : null,
        grossProfit: grossProfit !== null ? parseFloat(grossProfit.toFixed(2)) : null,
        grossMarginPercent,
        hasRecipe,
      }
    })

    // Compute Product Performance Matrix Quadrants
    const medianUnits =
      productList.length > 0
        ? [...productList].sort((a, b) => a.unitsSold - b.unitsSold)[Math.floor(productList.length / 2)]?.unitsSold || 5
        : 5

    const productsWithMatrix = productList.map((p) => {
      // If recipe is configured, use grossMarginPercent (benchmark 60%); else use revenue contribution benchmark
      const isHighMargin =
        p.grossMarginPercent !== null ? p.grossMarginPercent >= 60 : p.contribution >= 5
      const isHighVolume = p.unitsSold >= medianUnits

      let quadrant = "DOG" // Underperformer
      let quadrantLabel = "Underperformer"
      let actionSuggestion = "Low volume and profitability. Review recipe appeal or consider rotating."

      if (isHighVolume && isHighMargin) {
        quadrant = "STAR"
        quadrantLabel = "Star Product"
        actionSuggestion = "High sales and high profitability! Ensure kitchen ingredients are never out of stock."
      } else if (isHighVolume && !isHighMargin) {
        quadrant = "CASH_COW"
        quadrantLabel = "Cash Cow"
        actionSuggestion = "Customer favorite. Optimize portion sizing or adjust price slightly to improve margin."
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
    const categoryStatsMap = new Map<string, { category: string; unitsSold: number; revenue: number; ordersCount: Set<string> }>()
    for (const p of productsWithMatrix) {
      const cat = p.categoryName || "General"
      const existing = categoryStatsMap.get(cat) || { category: cat, unitsSold: 0, revenue: 0, ordersCount: new Set() }
      existing.unitsSold += p.unitsSold
      existing.revenue += p.revenue
      categoryStatsMap.set(cat, existing)
    }
    const categoryPerformance = Array.from(categoryStatsMap.values())
      .map((c) => ({
        category: c.category,
        unitsSold: c.unitsSold,
        revenue: Math.round(c.revenue),
        contribution: currentRevenue > 0 ? parseFloat(((c.revenue / currentRevenue) * 100).toFixed(1)) : 0,
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

    // Variants and Addons Analysis
    const totalVariantsCount = allMenuItems.reduce((sum, m) => sum + (m.variants?.length || 0), 0)
    const totalAddonsCount = allMenuItems.reduce((sum, m) => sum + (m.addons?.length || 0), 0)

    const variantsData = {
      available: totalVariantsCount > 0,
      message: totalVariantsCount > 0 ? undefined : "No item variants configured in Menu.",
      count: totalVariantsCount,
    }

    const addonsData = {
      available: totalAddonsCount > 0,
      message: totalAddonsCount > 0 ? undefined : "No add-ons configured in Menu.",
      count: totalAddonsCount,
      attachRate: 0,
    }

    // Product Trends (Revenue and Units Timeline)
    const productTrends = customerGrowthTrend.map((t) => ({
      date: t.date,
      label: t.label,
      revenue: t.revenue,
      units: validCurrent
        .filter((o) => (isSingleDay ? String(new Date(o.created_at).getHours()) === t.date : o.created_at.toISOString().split("T")[0] === t.date))
        .reduce((sum, o) => sum + o.items.reduce((iSum, it) => iSum + it.quantity, 0), 0),
    }))

    // Total units sold across all products
    const totalUnitsSold = productsWithMatrix.reduce((sum, p) => sum + p.unitsSold, 0)
    const prevUnitsSold = validPrev.reduce((sum, o) => sum + o.items.reduce((iSum, it) => iSum + it.quantity, 0), 0)
    const unitsSoldGrowth = calcGrowth(totalUnitsSold, prevUnitsSold)

    // ─────────────────────────────────────────────────────────────
    // 5. SECTION 3: INVENTORY & WASTE ANALYTICS
    // ─────────────────────────────────────────────────────────────
    let totalInventoryValuation = 0
    const lowStockItems: any[] = []
    const outOfStockItems: any[] = []

    for (const inv of allInventoryItems) {
      const q = Number(inv.quantity)
      const cost = inv.cost_per_unit ? Number(inv.cost_per_unit) : 0
      const minStock = Number(inv.minimum_stock)
      const reorderLvl = Number(inv.reorder_level)

      if (cost && q > 0) {
        totalInventoryValuation += q * cost
      }

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

    // Previous period inventory transactions for comparisons
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

    // Expected vs Actual Consumption (for menu items with recipe ingredients)
    const expectedIngredientConsumption = new Map<
      string,
      {
        id: string
        name: string
        unit: string
        expectedQty: number
        actualQty: number
      }
    >()

    // Initialize with active ingredients
    for (const inv of allInventoryItems) {
      expectedIngredientConsumption.set(inv.id, {
        id: inv.id,
        name: inv.name,
        unit: inv.unit,
        expectedQty: 0,
        actualQty: 0,
      })
    }

    // Compute expected quantity from sold items
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

    // Compute actual deductions from ORDER_DEDUCTION transactions
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
        return {
          id: c.id,
          name: c.name,
          unit: c.unit,
          expectedQty: parseFloat(c.expectedQty.toFixed(2)),
          actualQty: parseFloat(c.actualQty.toFixed(2)),
          variance: parseFloat(variance.toFixed(2)),
          variancePercent,
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

    // Waste by Ingredient array
    const wasteByIngredient = Array.from(wasteByIngredientMap.values())
      .map((w) => ({
        name: w.name,
        quantity: parseFloat(w.quantity.toFixed(2)),
        cost: Math.round(w.cost),
        unit: w.unit,
      }))
      .sort((a, b) => b.cost - a.cost)

    // Waste by Reason array
    const wasteByReason = Array.from(wasteByReasonMap.values())
      .map((r) => ({
        reason: r.reason,
        count: r.count,
        cost: Math.round(r.cost),
      }))
      .sort((a, b) => b.cost - a.cost)

    // Consumption Timeline
    const inventoryConsumptionTrend = Array.from(consumptionByDateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    // ─────────────────────────────────────────────────────────────
    // 6. SECTION 4: BUSINESS INSIGHTS GENERATION
    // ─────────────────────────────────────────────────────────────
    const insights: Array<{
      id: string
      type: "success" | "warning" | "opportunity" | "info"
      badge: string
      title: string
      what: string
      why: string
      action: string
      actionLink?: string
    }> = []

    // 1. Revenue Trajectory Insight
    if (revenueGrowth !== null) {
      if (revenueGrowth > 5) {
        insights.push({
          id: "revenue-growth",
          type: "success",
          badge: "📈 Strong Growth",
          title: "Revenue Accelerated",
          what: `Total revenue rose by +${revenueGrowth}% (₹${Math.round(currentRevenue).toLocaleString()} vs ₹${Math.round(prevRevenue).toLocaleString()} in previous period).`,
          why: "Higher ordering velocity and basket values are driving positive business momentum.",
          action: "Maintain current promotions and ensure kitchen prep handles the increased peak-hour volume.",
        })
      } else if (revenueGrowth < -5) {
        insights.push({
          id: "revenue-decline",
          type: "warning",
          badge: "📉 Revenue Dip",
          title: "Revenue Declined vs Previous Period",
          what: `Revenue fell by ${revenueGrowth}% compared to the equivalent prior period (₹${Math.round(currentRevenue).toLocaleString()} vs ₹${Math.round(prevRevenue).toLocaleString()}).`,
          why: "Slower order count or reduced average order value is reducing cash inflow.",
          action: "Launch a WhatsApp broadcast promotion to inactive customers via Customer Offers.",
          actionLink: "/customers/offers",
        })
      }
    }

    // 2. Customer Retention & Repeat Rate Insight
    if (totalActiveCustomers > 0) {
      if (repeatCustomerRate >= 40) {
        insights.push({
          id: "retention-high",
          type: "success",
          badge: "👥 Loyal Base",
          title: "High Customer Loyalty",
          what: `${repeatCustomerRate.toFixed(1)}% of customers ordering in this period are repeat diners (${returningCustomersCount} returning).`,
          why: "Repeat customers spend consistently and cost significantly less to serve than acquiring new customers.",
          action: "Reward loyal diners with bonus points to sustain high lifetime value.",
          actionLink: "/customers",
        })
      } else if (repeatCustomerRate < 20 && totalActiveCustomers >= 5) {
        insights.push({
          id: "retention-low",
          type: "opportunity",
          badge: "💡 Retention Opportunity",
          title: "Room to Grow Repeat Orders",
          what: `Only ${repeatCustomerRate.toFixed(1)}% of diners are returning customers (${newCustomersCount} are first-time buyers).`,
          why: "Converting first-time diners into regulars is the most cost-effective lever to double restaurant revenue.",
          action: "Dispatch an automated second-order discount via WhatsApp within 5 days of their initial order.",
          actionLink: "/customers/offers",
        })
      }
    }

    // 3. At-Risk High-Value Customers
    if (segmentCounts.AT_RISK > 0) {
      insights.push({
        id: "at-risk-customers",
        type: "warning",
        badge: "⚠️ Retention Alert",
        title: `${segmentCounts.AT_RISK} High-Value Customers Going Dormant`,
        what: `${segmentCounts.AT_RISK} regular customers haven't placed an order in over 30 days.`,
        why: "Dormant customers churn permanently if not re-engaged within 45–60 days.",
        action: "Send a targeted 'We miss you' combo voucher to reactivate them before they churn.",
        actionLink: "/customers/offers",
      })
    }

    // 4. Star Product Contribution
    if (topProductsByRevenue.length > 0 && topProductsByRevenue[0].revenue > 0) {
      const topProd = topProductsByRevenue[0]
      insights.push({
        id: "top-star-product",
        type: "info",
        badge: "⭐ Anchor Item",
        title: `"${topProd.name}" Drives Revenue`,
        what: `"${topProd.name}" generated ₹${topProd.revenue.toLocaleString()} (${topProd.contribution}% of total food sales).`,
        why: "This is your hero menu item that brings customers in the door.",
        action: "Create bundled combos pairing this item with high-margin drinks or sides.",
        actionLink: "/menu",
      })
    }

    // 5. Significant Product Sales Decline
    if (productGrowthComparison.decliners.length > 0) {
      const decliner = productGrowthComparison.decliners[0]
      if (decliner.growth !== null && decliner.growth < -20) {
        insights.push({
          id: "product-decliner",
          type: "warning",
          badge: "📉 Sales Drop",
          title: `"${decliner.name}" Sales Dropped ${decliner.growth}%`,
          what: `Sales dropped from prior period levels down to ₹${decliner.revenue.toLocaleString()}.`,
          why: "Could be caused by quality inconsistency, uncompetitive pricing, or poor menu visibility.",
          action: "Check customer reviews and verify kitchen preparation quality.",
        })
      }
    }

    // 6. Recipe Variance / Over-portioning Alert
    const highVarianceItem = consumptionVariance.find((v) => v.variancePercent !== null && v.variancePercent > 10)
    if (highVarianceItem) {
      insights.push({
        id: "recipe-variance-alert",
        type: "warning",
        badge: "🥫 Portions Alert",
        title: `Kitchen Over-Portioning Detected on "${highVarianceItem.name}"`,
        what: `Actual kitchen consumption was +${highVarianceItem.variancePercent}% higher than standard recipe expectation (+${highVarianceItem.variance} ${highVarianceItem.unit}).`,
        why: "Unrecorded spills, generous portioning, or staff snacking directly inflate your food costs.",
        action: "Audit chef portion control and inspect measurement scoops in the kitchen.",
        actionLink: "/inventory",
      })
    }

    // 7. Highest Waste Ingredient
    if (wasteByIngredient.length > 0 && wasteByIngredient[0].cost > 0) {
      const highestWaste = wasteByIngredient[0]
      insights.push({
        id: "high-waste-alert",
        type: "warning",
        badge: "🗑️ Waste Cost",
        title: `"${highestWaste.name}" Incurred Highest Waste`,
        what: `₹${highestWaste.cost.toLocaleString()} worth of "${highestWaste.name}" (${highestWaste.quantity} ${highestWaste.unit}) was recorded as waste.`,
        why: "Wastage directly erodes your gross profit margin.",
        action: "Order in smaller, more frequent batches to preserve freshness and reduce spoilage.",
        actionLink: "/inventory",
      })
    }

    // 8. Stockout Risk Alert
    if (stockoutApproaching.length > 0) {
      const urgentItem = stockoutApproaching[0]
      insights.push({
        id: "stockout-alert",
        type: "warning",
        badge: "⚠️ Low Stock",
        title: `"${urgentItem.name}" Approaching Stockout`,
        what: `Only ${urgentItem.currentStock} ${urgentItem.unit} remaining (${urgentItem.daysRemaining !== null ? `~${urgentItem.daysRemaining} days` : "low stock"}).`,
        why: "Running out of ingredients forces you to 86 popular menu items, losing sales and frustrating diners.",
        action: `Reorder approximately ${urgentItem.suggestedReorder || urgentItem.reorderLevel} ${urgentItem.unit} immediately.`,
        actionLink: "/inventory",
      })
    }

    // ─────────────────────────────────────────────────────────────
    // 7. RETURN STRUCTURED UNIFIED BUSINESS INTELLIGENCE
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

      // Executive Business Insights
      insights,

      // High-level Overview KPIs
      kpis: {
        revenue: { value: Math.round(currentRevenue), prev: Math.round(prevRevenue), growth: revenueGrowth },
        totalOrders: { value: currentOrderCount, prev: prevOrderCount, growth: orderCountGrowth },
        aov: { value: parseFloat(currentAOV.toFixed(2)), prev: parseFloat(prevAOV.toFixed(2)), growth: aovGrowth },
        totalUnitsSold: { value: totalUnitsSold, prev: prevUnitsSold, growth: unitsSoldGrowth },
        activeCustomers: { value: totalActiveCustomers, prev: prevActiveCustomers, growth: customerGrowth },
        newCustomers: { value: newCustomersCount },
        returningCustomers: { value: returningCustomersCount },
        repeatCustomerRate: { value: parseFloat(repeatCustomerRate.toFixed(1)) },
        customerRetentionRate: { value: customerRetentionRate !== null ? parseFloat(customerRetentionRate.toFixed(1)) : null },
        cancelledOrders: { value: totalCancelledOrRejected, rate: allOrdersInPeriod.length > 0 ? parseFloat(((totalCancelledOrRejected / allOrdersInPeriod.length) * 100).toFixed(1)) : 0 },
        lostRevenue: { value: Math.round(lostRevenue) },
      },

      // Section 1: Customers
      customers: {
        totalActiveCustomers,
        newCustomersCount,
        returningCustomersCount,
        repeatCustomerRate: parseFloat(repeatCustomerRate.toFixed(1)),
        customerRetentionRate: customerRetentionRate !== null ? parseFloat(customerRetentionRate.toFixed(1)) : null,
        aov: parseFloat(currentAOV.toFixed(2)),
        revenuePerCustomer: parseFloat(revenuePerCustomer.toFixed(2)),
        ordersPerCustomer: parseFloat(ordersPerCustomer.toFixed(2)),
        totalCustomerRevenue: Math.round(currentRevenue),
        avgCustomerLtv: Math.round(avgCustomerLtv),
        growth: {
          activeCustomers: customerGrowth,
          revenue: revenueGrowth,
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
        cohortRetention,
      },

      // Section 2: Products
      products: {
        totalUnitsSold,
        totalRevenue: Math.round(currentRevenue),
        averageSellingPrice: totalUnitsSold > 0 ? parseFloat((currentRevenue / totalUnitsSold).toFixed(2)) : 0,
        growth: {
          unitsSold: unitsSoldGrowth,
          revenue: revenueGrowth,
        },
        trends: productTrends,
        topByRevenue: topProductsByRevenue,
        topByQuantity: topProductsByQuantity,
        categoryPerformance,
        growthComparison: productGrowthComparison,
        performanceMatrix: productsWithMatrix,
        frequentlyBoughtTogether,
        variants: variantsData,
        addons: addonsData,
      },

      // Section 3: Inventory & Waste
      inventory: {
        valuation: Math.round(totalInventoryValuation),
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
        consumptionVariance,
        stockoutApproaching,
        reorderAnalysis,
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
