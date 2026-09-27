import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { requireAdminApi } from "@/lib/role-check"
import { recordManualInventoryTransaction } from "@/lib/inventory/service"
import { InventoryTransactionType } from "@prisma/client"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const inventoryItemId = searchParams.get("inventory_item_id")
    const type = searchParams.get("type") as InventoryTransactionType | null
    const branchId = searchParams.get("branch_id")
    const orderId = searchParams.get("order_id")
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id ? { branch_id: session.user.branch_id } : branchId ? { branch_id: branchId } : {}

    const where: any = {
      restaurant_id: restaurantId,
      ...branchScope,
      ...(inventoryItemId && { inventory_item_id: inventoryItemId }),
      ...(type && { type }),
      ...(orderId && { order_id: orderId }),
    }

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
        order: {
          select: {
            id: true,
            order_number: true,
            source: true,
            status: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: Math.min(limit, 200),
    })

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      restaurant_id: tx.restaurant_id,
      branch_id: tx.branch_id,
      inventory_item_id: tx.inventory_item_id,
      inventory_item_name: tx.inventoryItem.name,
      inventory_item_unit: tx.inventoryItem.unit,
      order_id: tx.order_id,
      order_number: tx.order?.order_number || null,
      order_source: tx.order?.source || null,
      type: tx.type,
      quantity: Number(tx.quantity),
      previous_quantity: tx.previous_quantity ? Number(tx.previous_quantity) : null,
      new_quantity: tx.new_quantity ? Number(tx.new_quantity) : null,
      unit_cost: tx.unit_cost ? Number(tx.unit_cost) : null,
      total_cost: tx.total_cost ? Number(tx.total_cost) : null,
      reason: tx.reason,
      created_by: tx.created_by,
      created_at: tx.created_at,
    }))

    return NextResponse.json(formatted)
  } catch (error: any) {
    console.error("Fetch Inventory Transactions Error:", error)
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
      inventory_item_id,
      type, // "PURCHASE" | "ADJUSTMENT" | "WASTAGE"
      quantity,
      unit_cost,
      reason,
      branch_id,
    } = body

    if (!inventory_item_id) {
      return NextResponse.json({ error: "Inventory item is required" }, { status: 400 })
    }
    if (!["PURCHASE", "ADJUSTMENT", "WASTAGE"].includes(type)) {
      return NextResponse.json({ error: "Type must be PURCHASE, ADJUSTMENT, or WASTAGE" }, { status: 400 })
    }
    const parsedQty = parseFloat(quantity)
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id || branch_id || null

    const result = await prisma.$transaction(async (tx) => {
      return recordManualInventoryTransaction(tx, {
        restaurant_id: restaurantId,
        branch_id: branchScope,
        inventory_item_id,
        type,
        quantity: parsedQty,
        unit_cost: unit_cost !== undefined && unit_cost !== "" && unit_cost !== null ? parseFloat(unit_cost) : null,
        reason: reason?.trim() || null,
        created_by: session.user.id,
      })
    })

    return NextResponse.json({
      success: true,
      item: {
        ...result.item,
        quantity: Number(result.item.quantity),
      },
      transaction: {
        ...result.transaction,
        quantity: Number(result.transaction.quantity),
        previous_quantity: result.transaction.previous_quantity ? Number(result.transaction.previous_quantity) : null,
        new_quantity: result.transaction.new_quantity ? Number(result.transaction.new_quantity) : null,
      },
    })
  } catch (error: any) {
    console.error("Create Inventory Transaction Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
