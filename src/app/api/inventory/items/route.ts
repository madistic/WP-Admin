import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireAdminApi } from "@/lib/role-check"
import { calculateArithmeticAveragePurchaseUnitCost } from "@/lib/inventory/service"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim()
    const filter = searchParams.get("filter") // "all" | "low_stock" | "out_of_stock" | "inactive"
    const branchId = searchParams.get("branch_id")

    const restaurantId = session.user.restaurant_id
    const userBranchScope = session.user.branch_id
      ? { OR: [{ branch_id: session.user.branch_id }, { branch_id: null }] }
      : branchId
      ? { branch_id: branchId }
      : {}

    const where: any = {
      restaurant_id: restaurantId,
      ...userBranchScope,
      ...(search && {
        name: { contains: search, mode: "insensitive" },
      }),
    }

    if (filter === "inactive") {
      where.is_active = false
    } else {
      where.is_active = true
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            ingredients: true,
            transactions: true,
          },
        },
      },
      orderBy: [{ name: "asc" }],
    })

    // Filter in-memory for low_stock / out_of_stock computed conditions
    let filteredItems = items
    if (filter === "low_stock") {
      filteredItems = items.filter((item) => {
        const qty = Number(item.quantity)
        const min = Number(item.minimum_stock)
        return qty > 0 && qty <= min
      })
    } else if (filter === "out_of_stock") {
      filteredItems = items.filter((item) => Number(item.quantity) <= 0)
    }

    // Fetch active purchase ledger transactions to calculate arithmetic average unit cost
    const itemIds = filteredItems.map((i) => i.id)
    const purchaseTransactions = itemIds.length > 0
      ? await prisma.inventoryTransaction.findMany({
          where: {
            restaurant_id: restaurantId,
            inventory_item_id: { in: itemIds },
            type: "PURCHASE",
            unit_cost: { not: null, gt: 0 },
          },
          select: {
            inventory_item_id: true,
            unit_cost: true,
            reason: true,
          },
        })
      : []

    const purchaseMap = new Map<string, Array<{ unit_cost: Prisma.Decimal | number | null; reason?: string | null }>>()
    for (const tx of purchaseTransactions) {
      const list = purchaseMap.get(tx.inventory_item_id) || []
      list.push(tx)
      purchaseMap.set(tx.inventory_item_id, list)
    }

    // Format Decimal values for clean JSON response
    const formatted = filteredItems.map((item) => {
      const qty = Number(item.quantity)
      const minStock = Number(item.minimum_stock)
      const reorderLevel = Number(item.reorder_level)
      
      // Calculate Cost Per Unit from active purchase ledger entries using arithmetic average (sum / count)
      const itemPurchases = purchaseMap.get(item.id) || []
      const unitCost = calculateArithmeticAveragePurchaseUnitCost(itemPurchases) ?? (item.cost_per_unit ? Number(item.cost_per_unit) : null)
      const totalValue = unitCost !== null ? qty * unitCost : null

      return {
        id: item.id,
        restaurant_id: item.restaurant_id,
        branch_id: item.branch_id,
        branch: item.branch,
        name: item.name,
        quantity: qty,
        unit: item.unit,
        opening_stock: Number(item.opening_stock),
        minimum_stock: minStock,
        reorder_level: reorderLevel,
        cost_per_unit: unitCost,
        total_value: totalValue,
        is_active: item.is_active,
        is_low_stock: qty > 0 && qty <= minStock,
        is_out_of_stock: qty <= 0,
        linked_recipes_count: item._count.ingredients,
        transactions_count: item._count.transactions,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }
    })

    return NextResponse.json(formatted)
  } catch (error: any) {
    console.error("Fetch Inventory Items Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const body = await request.json()
    const {
      name,
      quantity,
      unit,
      opening_stock,
      minimum_stock,
      reorder_level,
      cost_per_unit,
      branch_id,
    } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }
    if (!unit || !unit.trim()) {
      return NextResponse.json({ error: "Unit is required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id || branch_id || null

    const initialQty = quantity !== undefined && quantity !== "" ? parseFloat(quantity) : (opening_stock ? parseFloat(opening_stock) : 0)
    const parsedMinStock = minimum_stock !== undefined && minimum_stock !== "" ? parseFloat(minimum_stock) : 0
    const parsedReorder = reorder_level !== undefined && reorder_level !== "" ? parseFloat(reorder_level) : 0
    const parsedCost = cost_per_unit !== undefined && cost_per_unit !== "" && cost_per_unit !== null ? parseFloat(cost_per_unit) : null

    const initialQtyDecimal = new Prisma.Decimal(Math.max(0, initialQty).toFixed(3))
    const minStockDecimal = new Prisma.Decimal(Math.max(0, parsedMinStock).toFixed(3))
    const reorderDecimal = new Prisma.Decimal(Math.max(0, parsedReorder).toFixed(3))
    const costDecimal = parsedCost !== null ? new Prisma.Decimal(Math.max(0, parsedCost).toFixed(2)) : null

    // Create within transaction to guarantee OPENING ledger entry if initial stock > 0
    const createdItem = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          restaurant_id: restaurantId,
          branch_id: branchScope,
          name: name.trim(),
          quantity: initialQtyDecimal,
          unit: unit.trim(),
          opening_stock: initialQtyDecimal,
          minimum_stock: minStockDecimal,
          reorder_level: reorderDecimal,
          cost_per_unit: costDecimal,
          is_active: true,
        },
      })

      // If initial stock is greater than 0, create an OPENING transaction record
      if (initialQty > 0) {
        await tx.inventoryTransaction.create({
          data: {
            restaurant_id: restaurantId,
            branch_id: branchScope,
            inventory_item_id: item.id,
            type: "OPENING",
            quantity: initialQtyDecimal,
            previous_quantity: new Prisma.Decimal(0),
            new_quantity: initialQtyDecimal,
            unit_cost: costDecimal,
            total_cost: costDecimal ? new Prisma.Decimal((Number(costDecimal) * initialQty).toFixed(2)) : null,
            reason: "Initial stock on item creation",
            created_by: session.user.id,
          },
        })
      }

      return item
    })

    return NextResponse.json(
      {
        ...createdItem,
        quantity: Number(createdItem.quantity),
        opening_stock: Number(createdItem.opening_stock),
        minimum_stock: Number(createdItem.minimum_stock),
        reorder_level: Number(createdItem.reorder_level),
        cost_per_unit: createdItem.cost_per_unit ? Number(createdItem.cost_per_unit) : null,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Create Inventory Item Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
