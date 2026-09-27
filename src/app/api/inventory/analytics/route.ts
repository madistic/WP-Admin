import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "30DAYS"
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const branchId = searchParams.get("branch_id")

    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id
      ? { OR: [{ branch_id: session.user.branch_id }, { branch_id: null }] }
      : branchId
      ? { branch_id: branchId }
      : {}

    // Calculate start and end dates
    const now = new Date()
    let startDate = new Date()
    let endDate = new Date(now.setHours(23, 59, 59, 999))

    switch (range) {
      case "TODAY":
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case "YESTERDAY": {
        const y = new Date()
        y.setDate(y.getDate() - 1)
        startDate = new Date(y.setHours(0, 0, 0, 0))
        endDate = new Date(y.setHours(23, 59, 59, 999))
        break
      }
      case "7DAYS":
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 7)
        startDate.setHours(0, 0, 0, 0)
        break
      case "30DAYS":
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)
        startDate.setHours(0, 0, 0, 0)
        break
      case "THIS_MONTH":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
        break
      case "CUSTOM":
        if (startDateParam && endDateParam) {
          startDate = new Date(startDateParam)
          startDate.setHours(0, 0, 0, 0)
          endDate = new Date(endDateParam)
          endDate.setHours(23, 59, 59, 999)
        }
        break
    }

    // 1. Fetch all active inventory items
    const items = await prisma.inventoryItem.findMany({
      where: {
        restaurant_id: restaurantId,
        ...branchScope,
        is_active: true,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    })

    // Calculate current stock metrics
    let totalValuation = 0
    const lowStockItems: any[] = []
    const outOfStockItems: any[] = []

    for (const item of items) {
      const qty = Number(item.quantity)
      const min = Number(item.minimum_stock)
      const cost = item.cost_per_unit ? Number(item.cost_per_unit) : null

      if (cost && qty > 0) {
        totalValuation += qty * cost
      }

      if (qty <= 0) {
        outOfStockItems.push({
          id: item.id,
          name: item.name,
          quantity: qty,
          unit: item.unit,
          minimum_stock: min,
          reorder_level: Number(item.reorder_level),
          cost_per_unit: cost,
        })
      } else if (qty <= min) {
        lowStockItems.push({
          id: item.id,
          name: item.name,
          quantity: qty,
          unit: item.unit,
          minimum_stock: min,
          reorder_level: Number(item.reorder_level),
          cost_per_unit: cost,
          shortfall: (min - qty).toFixed(2),
        })
      }
    }

    // 2. Fetch period transactions
    const periodTransactions = await prisma.inventoryTransaction.findMany({
      where: {
        restaurant_id: restaurantId,
        ...branchScope,
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true, cost_per_unit: true } },
        order: {
          select: {
            id: true,
            order_number: true,
            source: true,
            status: true,
            items: {
              select: {
                item_name_snapshot: true,
                quantity: true,
                menu_item_id: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    })

    // Summarize period transactions by type
    let consumedQty = 0
    let consumedCost = 0
    let wastageQty = 0
    let wastageCost = 0
    let purchasesQty = 0
    let purchasesCost = 0
    let adjustmentCount = 0
    let reversalsCount = 0

    // Grouping by date
    const dateMap = new Map<string, { date: string; consumed_qty: number; consumed_cost: number; wastage_qty: number; purchases_qty: number }>()

    // Grouping consumption by menu item
    const menuItemConsumptionMap = new Map<string, { menu_item_name: string; order_count: number; total_cost: number; ingredients_used: Map<string, { name: string; quantity: number; unit: string }> }>()

    for (const tx of periodTransactions) {
      const q = Number(tx.quantity)
      const cost = tx.total_cost ? Number(tx.total_cost) : (tx.unit_cost ? Number(tx.unit_cost) * q : 0)
      const dateStr = tx.created_at.toISOString().split("T")[0]

      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, consumed_qty: 0, consumed_cost: 0, wastage_qty: 0, purchases_qty: 0 })
      }
      const dayData = dateMap.get(dateStr)!

      switch (tx.type) {
        case "ORDER_DEDUCTION":
          consumedQty += q
          consumedCost += cost
          dayData.consumed_qty += q
          dayData.consumed_cost += cost

          // Attribute to menu items in this order
          if (tx.order && tx.order.items.length > 0) {
            for (const item of tx.order.items) {
              const name = item.item_name_snapshot
              if (!menuItemConsumptionMap.has(name)) {
                menuItemConsumptionMap.set(name, {
                  menu_item_name: name,
                  order_count: 0,
                  total_cost: 0,
                  ingredients_used: new Map(),
                })
              }
              const mic = menuItemConsumptionMap.get(name)!
              mic.order_count += item.quantity
              mic.total_cost += cost / tx.order.items.length // approximate share

              const ingKey = tx.inventoryItem.name
              if (!mic.ingredients_used.has(ingKey)) {
                mic.ingredients_used.set(ingKey, {
                  name: ingKey,
                  quantity: 0,
                  unit: tx.inventoryItem.unit,
                })
              }
              mic.ingredients_used.get(ingKey)!.quantity += q / tx.order.items.length
            }
          }
          break
        case "WASTAGE":
          wastageQty += q
          wastageCost += cost
          dayData.wastage_qty += q
          break
        case "PURCHASE":
          purchasesQty += q
          purchasesCost += cost
          dayData.purchases_qty += q
          break
        case "ADJUSTMENT":
          adjustmentCount++
          break
        case "REVERSAL":
          reversalsCount++
          consumedQty = Math.max(0, consumedQty - q)
          consumedCost = Math.max(0, consumedCost - cost)
          break
      }
    }

    // Convert date map to sorted array
    const consumptionByDate = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Convert menu item consumption to array
    const consumptionByMenuItem = Array.from(menuItemConsumptionMap.values())
      .map((entry) => ({
        menu_item_name: entry.menu_item_name,
        orders_sold: entry.order_count,
        estimated_ingredient_cost: Math.round(entry.total_cost),
        ingredients: Array.from(entry.ingredients_used.values()).map((ing) => ({
          name: ing.name,
          quantity: Number(ing.quantity.toFixed(2)),
          unit: ing.unit,
        })),
      }))
      .sort((a, b) => b.estimated_ingredient_cost - a.estimated_ingredient_cost)
      .slice(0, 15)

    // Recent 25 transactions
    const recentTransactions = periodTransactions.slice(0, 25).map((tx) => ({
      id: tx.id,
      date: tx.created_at,
      type: tx.type,
      item_name: tx.inventoryItem.name,
      unit: tx.inventoryItem.unit,
      quantity: Number(tx.quantity),
      new_quantity: tx.new_quantity ? Number(tx.new_quantity) : null,
      unit_cost: tx.unit_cost ? Number(tx.unit_cost) : null,
      total_cost: tx.total_cost ? Number(tx.total_cost) : null,
      order_number: tx.order?.order_number || null,
      order_source: tx.order?.source || null,
      reason: tx.reason,
    }))

    return NextResponse.json({
      summary: {
        total_items: items.length,
        total_valuation: Math.round(totalValuation),
        low_stock_count: lowStockItems.length,
        out_of_stock_count: outOfStockItems.length,
        consumed_quantity: Number(consumedQty.toFixed(2)),
        consumed_cost: Math.round(consumedCost),
        wastage_quantity: Number(wastageQty.toFixed(2)),
        wastage_cost: Math.round(wastageCost),
        purchases_quantity: Number(purchasesQty.toFixed(2)),
        purchases_cost: Math.round(purchasesCost),
        adjustments_count: adjustmentCount,
        reversals_count: reversalsCount,
      },
      low_stock_items: lowStockItems,
      out_of_stock_items: outOfStockItems,
      consumption_by_menu_item: consumptionByMenuItem,
      consumption_by_date: consumptionByDate,
      recent_transactions: recentTransactions,
      range,
      date_from: startDate.toISOString(),
      date_to: endDate.toISOString(),
    })
  } catch (error: any) {
    console.error("Inventory Analytics Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
