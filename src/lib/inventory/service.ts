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
  userId?: string | null
): Promise<{ success: boolean; deductedCount: number; alreadyDeducted?: boolean; message?: string }> {
  // 1. Idempotency Check: Verify if this order has already had its inventory deducted
  const existingDeduction = await tx.inventoryTransaction.findFirst({
    where: {
      order_id: orderId,
      type: "ORDER_DEDUCTION",
    },
  })

  if (existingDeduction) {
    console.log(`[Inventory Service] Order ${orderId} already has inventory deducted. Skipping (idempotent).`)
    return { success: true, deductedCount: 0, alreadyDeducted: true, message: "Inventory already deducted for this order." }
  }

  // 2. Fetch Order with its OrderItems and MenuItem ingredients
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              ingredients: {
                include: {
                  inventoryItem: true,
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

  // 3. Aggregate all required ingredient quantities across all order items
  // Key: inventory_item_id
  const deductionMap = new Map<string, IngredientDeductionPlan>()

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
          currentStock: Number(invItem.quantity),
          totalDeduction: lineDeduction,
          unit: invItem.unit,
          unitCost: invItem.cost_per_unit ? Number(invItem.cost_per_unit) : null,
        })
      }
    }
  }

  // If no menu items have ingredients configured, nothing to deduct
  if (deductionMap.size === 0) {
    console.log(`[Inventory Service] Order ${order.order_number} has no configured recipe ingredients.`)
    return { success: true, deductedCount: 0, message: "No ingredients required for this order." }
  }

  // 4. Validate stock availability for EVERY ingredient before modifying any stock
  const insufficientItems: string[] = []

  for (const plan of deductionMap.values()) {
    // Re-verify current stock under transaction lock
    const currentItem = await tx.inventoryItem.findUnique({
      where: { id: plan.inventoryItemId },
    })

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

  // 5. Deduct from inventory items and create immutable transaction records
  let deductedCount = 0

  for (const plan of deductionMap.values()) {
    const currentItem = await tx.inventoryItem.findUnique({
      where: { id: plan.inventoryItemId },
    })
    if (!currentItem) continue

    const currentQtyNum = Number(currentItem.quantity)
    const newQtyNum = currentQtyNum - plan.totalDeduction
    const newQtyDecimal = new Prisma.Decimal(newQtyNum.toFixed(3))
    const deductionQtyDecimal = new Prisma.Decimal(plan.totalDeduction.toFixed(3))

    // Update inventory quantity
    await tx.inventoryItem.update({
      where: { id: currentItem.id },
      data: {
        quantity: newQtyDecimal,
      },
    })

    // Record ORDER_DEDUCTION ledger transaction
    const unitCost = currentItem.cost_per_unit ? Number(currentItem.cost_per_unit) : null
    const totalCost = unitCost ? new Prisma.Decimal((unitCost * plan.totalDeduction).toFixed(2)) : null

    await tx.inventoryTransaction.create({
      data: {
        restaurant_id: order.restaurant_id,
        branch_id: order.branch_id,
        inventory_item_id: currentItem.id,
        order_id: order.id,
        type: "ORDER_DEDUCTION",
        quantity: deductionQtyDecimal,
        previous_quantity: currentItem.quantity,
        new_quantity: newQtyDecimal,
        unit_cost: currentItem.cost_per_unit,
        total_cost: totalCost,
        reason: `Order #${order.order_number} deduction`,
        created_by: userId || null,
      },
    })

    deductedCount++
  }

  console.log(`[Inventory Service] Successfully deducted ${deductedCount} ingredient(s) for order #${order.order_number}`)
  return { success: true, deductedCount }
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
      inventoryItem: true,
      order: true,
    },
  })

  if (deductions.length === 0) {
    console.log(`[Inventory Service] No inventory deductions found to reverse for order ${orderId}.`)
    return { success: true, reversedCount: 0, message: "No deductions found to reverse." }
  }

  const orderNumber = deductions[0]?.order?.order_number || orderId
  let reversedCount = 0

  // 3. Restore stock and record REVERSAL transactions
  for (const deduction of deductions) {
    const currentItem = await tx.inventoryItem.findUnique({
      where: { id: deduction.inventory_item_id },
    })

    if (!currentItem) {
      console.warn(`[Inventory Service] Cannot reverse stock: inventory item ${deduction.inventory_item_id} no longer exists.`)
      continue
    }

    const currentQtyNum = Number(currentItem.quantity)
    const deductionQtyNum = Number(deduction.quantity)
    const restoredQtyNum = currentQtyNum + deductionQtyNum
    const newQtyDecimal = new Prisma.Decimal(restoredQtyNum.toFixed(3))

    // Restore item stock
    await tx.inventoryItem.update({
      where: { id: currentItem.id },
      data: {
        quantity: newQtyDecimal,
      },
    })

    // Record REVERSAL transaction in ledger
    await tx.inventoryTransaction.create({
      data: {
        restaurant_id: deduction.restaurant_id,
        branch_id: deduction.branch_id,
        inventory_item_id: currentItem.id,
        order_id: orderId,
        type: "REVERSAL",
        quantity: deduction.quantity,
        previous_quantity: currentItem.quantity,
        new_quantity: newQtyDecimal,
        unit_cost: currentItem.cost_per_unit,
        total_cost: deduction.total_cost,
        reason: reason || `Order #${orderNumber} cancelled/reversed`,
        created_by: userId || null,
      },
    })

    reversedCount++
  }

  console.log(`[Inventory Service] Successfully reversed ${reversedCount} ingredient(s) for order #${orderNumber}`)
  return { success: true, reversedCount }
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
