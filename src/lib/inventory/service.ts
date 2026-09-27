import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { convertQuantity } from "./units"

export interface IngredientDeductionPlan {
  inventoryItemId: string
  inventoryItemName: string
  currentStock: number
  totalDeduction: number // in inventory item's native unit
  unit: string
  unitCost: number | null
}

/**
 * Deducts inventory ingredients for an order.
 * - Must be called within a Prisma transaction or will execute inside its own transaction.
 * - Idempotent: If an ORDER_DEDUCTION transaction already exists for this order, skips without re-deducting.
 * - Validates stock: If any ingredient is insufficient, throws an error and aborts the entire transaction.
 */
export async function deductInventoryForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId?: string | null,
  prefetchedOrder?: any
): Promise<{ success: boolean; deductedCount: number; alreadyDeducted?: boolean; message?: string }> {
  // 1. Idempotency Check: Verify if this order has already had its inventory deducted
  const existingDeduction = await tx.inventoryTransaction.findFirst({
    where: {
      order_id: orderId,
      type: "ORDER_DEDUCTION",
    },
    select: { id: true },
  })

  if (existingDeduction) {
    console.log(`[Inventory Service] Order ${orderId} already has inventory deducted. Skipping (idempotent).`)
    return { success: true, deductedCount: 0, alreadyDeducted: true, message: "Inventory already deducted for this order." }
  }

  // 2. Resolve Order with its OrderItems and MenuItem ingredients
  const order = prefetchedOrder || await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      restaurant_id: true,
      branch_id: true,
      order_number: true,
      items: {
        select: {
          quantity: true,
          menuItem: {
            select: {
              ingredients: {
                select: {
                  inventory_item_id: true,
                  quantity: true,
                  unit: true,
                  inventoryItem: {
                    select: {
                      id: true,
                      name: true,
                      quantity: true,
                      unit: true,
                      cost_per_unit: true,
                      is_active: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!order) {
    throw new Error(`Order ${orderId} not found for inventory deduction.`)
  }

  // 3. Aggregate all required ingredient quantities across all order items in memory
  const deductionMap = new Map<
    string,
    {
      inventoryItemId: string
      inventoryItemName: string
      totalDeduction: number
      unit: string
    }
  >()

  for (const orderItem of order.items) {
    const ingredients = orderItem.menuItem?.ingredients || []
    const orderQty = orderItem.quantity

    for (const ingredient of ingredients) {
      const invItem = ingredient.inventoryItem
      if (!invItem || !invItem.is_active) continue

      // Convert ingredient requirement quantity to the inventory item's tracking unit
      const ingredientQtyPerItem = Number(ingredient.quantity)
      const convertedQtyPerItem = convertQuantity(ingredientQtyPerItem, ingredient.unit, invItem.unit)
      const lineDeduction = convertedQtyPerItem * orderQty

      const existing = deductionMap.get(invItem.id)
      if (existing) {
        existing.totalDeduction += lineDeduction
      } else {
        deductionMap.set(invItem.id, {
          inventoryItemId: invItem.id,
          inventoryItemName: invItem.name,
          totalDeduction: lineDeduction,
          unit: invItem.unit,
        })
      }
    }
  }

  // If no menu items have ingredients configured, nothing to deduct
  if (deductionMap.size === 0) {
    console.log(`[Inventory Service] Order ${order.order_number} has no configured recipe ingredients.`)
    return { success: true, deductedCount: 0, message: "No ingredients required for this order." }
  }

  // 4. Batch fetch current stock for ALL required inventory items in a SINGLE query
  const requiredIds = Array.from(deductionMap.keys())
  const currentDbItems = await tx.inventoryItem.findMany({
    where: { id: { in: requiredIds } },
    select: {
      id: true,
      name: true,
      quantity: true,
      unit: true,
      cost_per_unit: true,
    },
  })

  const currentItemMap = new Map(currentDbItems.map((item) => [item.id, item]))

  // 5. Validate stock availability for EVERY ingredient before modifying any stock
  const insufficientItems: string[] = []

  for (const plan of deductionMap.values()) {
    const currentItem = currentItemMap.get(plan.inventoryItemId)

    if (!currentItem) {
      throw new Error(`Inventory item "${plan.inventoryItemName}" (${plan.inventoryItemId}) not found.`)
    }

    const availableStock = Number(currentItem.quantity)
    if (availableStock < plan.totalDeduction) {
      insufficientItems.push(
        `"${currentItem.name}": Available ${availableStock.toFixed(2)} ${currentItem.unit}, Required ${plan.totalDeduction.toFixed(2)} ${currentItem.unit}`
      )
    }
  }

  if (insufficientItems.length > 0) {
    const errorMsg = `Insufficient inventory stock to accept order #${order.order_number}:\n${insufficientItems.join("\n")}`
    console.error(`[Inventory Stock Safety Violation] ${errorMsg}`)
    throw new Error(errorMsg)
  }

  // 6. Perform atomic stock deductions & build ledger records
  const transactionRows: Array<{
    restaurant_id: string
    branch_id: string | null
    inventory_item_id: string
    order_id: string
    type: "ORDER_DEDUCTION"
    quantity: Prisma.Decimal
    previous_quantity: Prisma.Decimal
    new_quantity: Prisma.Decimal
    unit_cost: Prisma.Decimal | null
    total_cost: Prisma.Decimal | null
    reason: string
    created_by: string | null
  }> = []

  for (const plan of deductionMap.values()) {
    const currentItem = currentItemMap.get(plan.inventoryItemId)!
    const deductionDecimal = new Prisma.Decimal(plan.totalDeduction.toFixed(3))

    // Atomic decrement in PostgreSQL:
    // UPDATE "inventory_items" SET "quantity" = "quantity" - $1 WHERE "id" = $2 RETURNING *
    const updated = await tx.inventoryItem.update({
      where: { id: currentItem.id },
      data: {
        quantity: {
          decrement: deductionDecimal,
        },
      },
      select: {
        id: true,
        quantity: true,
      },
    })

    // Strict safety check: Never allow negative inventory
    if (Number(updated.quantity) < 0) {
      throw new Error(
        `Insufficient stock for "${currentItem.name}". Remaining stock cannot be negative (would be ${Number(updated.quantity)}).`
      )
    }

    const unitCostNum = currentItem.cost_per_unit ? Number(currentItem.cost_per_unit) : null
    const totalCostDecimal = unitCostNum ? new Prisma.Decimal((unitCostNum * plan.totalDeduction).toFixed(2)) : null

    transactionRows.push({
      restaurant_id: order.restaurant_id,
      branch_id: order.branch_id || null,
      inventory_item_id: currentItem.id,
      order_id: order.id,
      type: "ORDER_DEDUCTION",
      quantity: deductionDecimal,
      previous_quantity: currentItem.quantity,
      new_quantity: updated.quantity,
      unit_cost: currentItem.cost_per_unit,
      total_cost: totalCostDecimal,
      reason: `Order #${order.order_number} deduction`,
      created_by: userId || null,
    })
  }

  // 7. Bulk insert all ledger transactions in ONE query
  if (transactionRows.length > 0) {
    await tx.inventoryTransaction.createMany({
      data: transactionRows,
    })
  }

  console.log(`[Inventory Service] Successfully deducted ${transactionRows.length} ingredient(s) for order #${order.order_number}`)
  return { success: true, deductedCount: transactionRows.length }
}

/**
 * Reverses inventory deductions when an order is cancelled or rejected.
 * - Idempotent: If REVERSAL transactions already exist for this order, skips to prevent double restoration.
 * - Only reverses if previous ORDER_DEDUCTION records exist.
 */
export async function reverseInventoryForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason?: string | null,
  userId?: string | null
): Promise<{ success: boolean; reversedCount: number; alreadyReversed?: boolean; message?: string }> {
  // 1. Check if reversal has already been executed for this order
  const existingReversals = await tx.inventoryTransaction.findFirst({
    where: {
      order_id: orderId,
      type: "REVERSAL",
    },
    select: { id: true },
  })

  if (existingReversals) {
    console.log(`[Inventory Service] Order ${orderId} inventory has already been reversed. Skipping (idempotent).`)
    return { success: true, reversedCount: 0, alreadyReversed: true, message: "Inventory already reversed." }
  }

  // 2. Fetch all deductions made for this order
  const deductions = await tx.inventoryTransaction.findMany({
    where: {
      order_id: orderId,
      type: "ORDER_DEDUCTION",
    },
    include: {
      inventoryItem: {
        select: {
          id: true,
          name: true,
          quantity: true,
          cost_per_unit: true,
        },
      },
      order: {
        select: {
          order_number: true,
        },
      },
    },
  })

  if (deductions.length === 0) {
    console.log(`[Inventory Service] No inventory deductions found to reverse for order ${orderId}.`)
    return { success: true, reversedCount: 0, message: "No deductions found to reverse." }
  }

  const orderNumber = deductions[0]?.order?.order_number || orderId

  // 3. Restore stock atomically and build reversal transaction records
  const reversalRows: Array<{
    restaurant_id: string
    branch_id: string | null
    inventory_item_id: string
    order_id: string
    type: "REVERSAL"
    quantity: Prisma.Decimal
    previous_quantity: Prisma.Decimal
    new_quantity: Prisma.Decimal
    unit_cost: Prisma.Decimal | null
    total_cost: Prisma.Decimal | null
    reason: string
    created_by: string | null
  }> = []

  for (const deduction of deductions) {
    if (!deduction.inventoryItem) {
      console.warn(`[Inventory Service] Cannot reverse stock: inventory item ${deduction.inventory_item_id} no longer exists.`)
      continue
    }

    // Atomic increment in PostgreSQL
    const updated = await tx.inventoryItem.update({
      where: { id: deduction.inventory_item_id },
      data: {
        quantity: {
          increment: deduction.quantity,
        },
      },
      select: {
        id: true,
        quantity: true,
      },
    })

    reversalRows.push({
      restaurant_id: deduction.restaurant_id,
      branch_id: deduction.branch_id || null,
      inventory_item_id: deduction.inventory_item_id,
      order_id: orderId,
      type: "REVERSAL",
      quantity: deduction.quantity,
      previous_quantity: deduction.inventoryItem.quantity,
      new_quantity: updated.quantity,
      unit_cost: deduction.inventoryItem.cost_per_unit,
      total_cost: deduction.total_cost,
      reason: reason || `Order #${orderNumber} cancelled/reversed`,
      created_by: userId || null,
    })
  }

  if (reversalRows.length > 0) {
    await tx.inventoryTransaction.createMany({
      data: reversalRows,
    })
  }

  console.log(`[Inventory Service] Successfully reversed ${reversalRows.length} ingredient(s) for order #${orderNumber}`)
  return { success: true, reversedCount: reversalRows.length }
}

/**
 * Records a manual transaction (PURCHASE, ADJUSTMENT, WASTAGE, OPENING) and updates stock.
 * Guaranteed never to change stock without a transaction record.
 */
export async function recordManualInventoryTransaction(
  tx: Prisma.TransactionClient,
  params: {
    restaurant_id: string
    branch_id?: string | null
    inventory_item_id: string
    type: "PURCHASE" | "ADJUSTMENT" | "WASTAGE" | "OPENING"
    quantity: number // positive amount
    unit_cost?: number | null
    reason?: string | null
    created_by?: string | null
    allowNegative?: boolean
  }
) {
  const { restaurant_id, branch_id, inventory_item_id, type, quantity, unit_cost, reason, created_by, allowNegative } = params

  if (quantity < 0) {
    throw new Error("Transaction quantity must be a positive number.")
  }

  const item = await tx.inventoryItem.findFirst({
    where: { id: inventory_item_id, restaurant_id },
  })

  if (!item) {
    throw new Error("Inventory item not found.")
  }

  const currentQtyNum = Number(item.quantity)
  let newQtyNum = currentQtyNum

  if (type === "PURCHASE") {
    newQtyNum = currentQtyNum + quantity
  } else if (type === "WASTAGE") {
    newQtyNum = currentQtyNum - quantity
    if (newQtyNum < 0 && !allowNegative) {
      throw new Error(`Insufficient stock for wastage deduction. Current stock: ${currentQtyNum} ${item.unit}`)
    }
  } else if (type === "ADJUSTMENT") {
    // If reason specifies a reduction or if adjusting to an absolute value or delta
    newQtyNum = quantity // For absolute set or delta
  } else if (type === "OPENING") {
    newQtyNum = quantity
  }

  const newQtyDecimal = new Prisma.Decimal(newQtyNum.toFixed(3))
  const deltaQuantity = new Prisma.Decimal(Math.abs(newQtyNum - currentQtyNum).toFixed(3))
  const resolvedUnitCost = unit_cost !== undefined ? unit_cost : (item.cost_per_unit ? Number(item.cost_per_unit) : null)
  const totalCost = resolvedUnitCost ? new Prisma.Decimal((resolvedUnitCost * Number(deltaQuantity)).toFixed(2)) : null

  // Update item
  const updatedItem = await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      quantity: newQtyDecimal,
      ...(unit_cost !== undefined && unit_cost !== null && { cost_per_unit: new Prisma.Decimal(unit_cost.toFixed(2)) }),
      ...(type === "OPENING" && { opening_stock: newQtyDecimal }),
    },
  })

  // Create immutable ledger record
  const transaction = await tx.inventoryTransaction.create({
    data: {
      restaurant_id,
      branch_id: branch_id || item.branch_id,
      inventory_item_id: item.id,
      type,
      quantity: deltaQuantity,
      previous_quantity: item.quantity,
      new_quantity: newQtyDecimal,
      unit_cost: resolvedUnitCost ? new Prisma.Decimal(resolvedUnitCost.toFixed(2)) : null,
      total_cost: totalCost,
      reason: reason || `Manual ${type.toLowerCase()} record`,
      created_by: created_by || null,
    },
  })

  return { item: updatedItem, transaction }
}
