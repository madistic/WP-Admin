import { PointsTransactionType, Restaurant, Prisma } from "@prisma/client"

export interface RedemptionCalculation {
  redeemablePoints: number
  discountValueInr: number
  remainingPoints: number
}

/**
 * Calculate the maximum points a customer can redeem for a given order total.
 * Returns the points to deduct and the discount in INR.
 */
export function calculateRedemption(
  orderSubtotal: number,
  customerPointsBalance: number,
  settings: Pick<Restaurant, "loyalty_enabled" | "loyalty_min_order_value" | "loyalty_max_redemption_percent" | "loyalty_points_value_inr">
): RedemptionCalculation {
  if (!settings.loyalty_enabled) {
    return { redeemablePoints: 0, discountValueInr: 0, remainingPoints: customerPointsBalance }
  }

  if (orderSubtotal < settings.loyalty_min_order_value) {
    return { redeemablePoints: 0, discountValueInr: 0, remainingPoints: customerPointsBalance }
  }

  if (customerPointsBalance <= 0) {
    return { redeemablePoints: 0, discountValueInr: 0, remainingPoints: 0 }
  }

  // Max discount allowed by percentage of the order subtotal
  const maxDiscountInr = orderSubtotal * (settings.loyalty_max_redemption_percent / 100)
  
  // Potential discount from all customer points
  const potentialDiscountInr = customerPointsBalance * settings.loyalty_points_value_inr

  const actualDiscountInr = Math.min(maxDiscountInr, potentialDiscountInr)
  const redeemablePoints = Math.floor(actualDiscountInr / settings.loyalty_points_value_inr)
  const finalDiscountInr = redeemablePoints * settings.loyalty_points_value_inr

  return {
    redeemablePoints,
    discountValueInr: finalDiscountInr,
    remainingPoints: customerPointsBalance - redeemablePoints
  }
}

/**
 * Calculate the points a customer earns for a given paid amount (excluding delivery/tax).
 */
export function calculateEarnedPoints(
  eligibleAmountInr: number,
  settings: Pick<Restaurant, "loyalty_enabled" | "loyalty_amount_for_one_point">
): number {
  if (!settings.loyalty_enabled || settings.loyalty_amount_for_one_point <= 0) {
    return 0
  }
  return Math.floor(eligibleAmountInr / settings.loyalty_amount_for_one_point)
}

/**
 * Safely deduct points from a customer (Redemption).
 */
export async function redeemPointsTransaction(
  tx: Prisma.TransactionClient,
  customerId: string,
  restaurantId: string,
  orderId: string,
  pointsToRedeem: number,
  reason: string
) {
  if (pointsToRedeem <= 0) return

  const customer = await tx.customer.findUnique({ where: { id: customerId } })
  if (!customer || customer.points_balance < pointsToRedeem) {
    throw new Error("Insufficient points balance.")
  }

  // Will throw if order_id + type(REDEEM) already exists due to @@unique constraint
  await tx.pointsLedger.create({
    data: {
      customer_id: customerId,
      restaurant_id: restaurantId,
      order_id: orderId,
      type: PointsTransactionType.REDEEM,
      points: -pointsToRedeem, // Negative because we are deducting
      reason
    }
  })

  await tx.customer.update({
    where: { id: customerId },
    data: { points_balance: { decrement: pointsToRedeem } }
  })
}

/**
 * Safely add points to a customer (Earn).
 */
export async function earnPointsTransaction(
  tx: Prisma.TransactionClient,
  customerId: string,
  restaurantId: string,
  orderId: string,
  pointsToEarn: number,
  reason: string
) {
  if (pointsToEarn <= 0) return

  // Will throw if order_id + type(EARN) already exists due to @@unique constraint!
  await tx.pointsLedger.create({
    data: {
      customer_id: customerId,
      restaurant_id: restaurantId,
      order_id: orderId,
      type: PointsTransactionType.EARN,
      points: pointsToEarn, // Positive
      reason
    }
  })

  await tx.customer.update({
    where: { id: customerId },
    data: { points_balance: { increment: pointsToEarn } }
  })
}

/**
 * Reverse points for refunds (restore redeemed points) or reversals (take back earned points).
 */
export async function reversePointsTransaction(
  tx: Prisma.TransactionClient,
  customerId: string,
  restaurantId: string,
  orderId: string,
  type: PointsTransactionType.REFUND | PointsTransactionType.REVERSAL,
  pointsToAdjust: number, // positive number representing the absolute points
  reason: string
) {
  if (pointsToAdjust <= 0) return

  // Will throw if order_id + type already exists (prevents duplicate refunds)
  await tx.pointsLedger.create({
    data: {
      customer_id: customerId,
      restaurant_id: restaurantId,
      order_id: orderId,
      type,
      points: type === PointsTransactionType.REFUND ? pointsToAdjust : -pointsToAdjust,
      reason
    }
  })

  await tx.customer.update({
    where: { id: customerId },
    data: { 
      points_balance: type === PointsTransactionType.REFUND 
        ? { increment: pointsToAdjust }
        : { decrement: pointsToAdjust }
    }
  })
}
