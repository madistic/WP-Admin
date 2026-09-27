import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notificationService } from "@/lib/notifications"
import { OrderStatus } from "@prisma/client"
import { earnPointsTransaction, reversePointsTransaction } from "@/lib/loyalty"
import { deductInventoryForOrder, reverseInventoryForOrder } from "@/lib/inventory/service"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { status, reason } = await request.json()
    const restaurantId = session.user.restaurant_id
    const branchScope = session.user.branch_id ? { branch_id: session.user.branch_id } : {}

    if (!status || !Object.values(OrderStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // 1. Pre-fetch order with items and ingredients OUTSIDE the interactive transaction
    const order = await prisma.order.findUnique({
      where: { id: orderId, restaurant_id: restaurantId, ...branchScope },
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
      return NextResponse.json({ error: "Order not found or unauthorized" }, { status: 404 })
    }

    // 2. Idempotency Check: If order is ALREADY in the requested status, do not re-process or re-deduct
    if (order.status === status) {
      return NextResponse.json(order)
    }

    // 3. Enforce State Machine Transitions
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      NEW: ["IN_PROCESS", "REJECTED", "CANCELLED"],
      IN_PROCESS: ["OUT_FOR_DELIVERY", "CANCELLED"],
      OUT_FOR_DELIVERY: ["DELIVERED"],
      DELIVERED: [],
      REJECTED: [],
      CANCELLED: [],
    }

    const allowed = validTransitions[order.status]?.includes(status as OrderStatus)

    if (!allowed) {
      return NextResponse.json(
        { error: `Invalid state transition from ${order.status} to ${status}` },
        { status: 400 }
      )
    }

    // 4. Pre-fetch restaurant loyalty settings outside transaction if completing delivery
    let restDb: { loyalty_enabled: boolean; loyalty_amount_for_one_point: number } | null = null
    if (status === "DELIVERED") {
      restDb = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { loyalty_enabled: true, loyalty_amount_for_one_point: true },
      })
    }

    // 5. Run atomic write transaction (minimal queries, fast row locks)
    const updatedOrder = await prisma.$transaction(
      async (tx) => {
        // WHATSAPP: Deduct inventory when accepted by staff (NEW -> IN_PROCESS)
        if (status === "IN_PROCESS" && order.status === "NEW" && order.source === "WHATSAPP") {
          await deductInventoryForOrder(tx, order.id, session.user.id, order)
        }

        // POS: Deduct inventory if completed/finalized via status transition (IN_PROCESS -> DELIVERED)
        if (status === "DELIVERED" && order.source === "POS") {
          await deductInventoryForOrder(tx, order.id, session.user.id, order)
        }

        // REVERSAL: Reverse inventory if cancelled or rejected
        if (status === "CANCELLED" || status === "REJECTED") {
          await reverseInventoryForOrder(tx, order.id, reason, session.user.id)
        }

        // Determine timestamps and update data
        const updateData: any = { status }
        if (status === "IN_PROCESS") {
          updateData.accepted_at = new Date()
          updateData.assigned_employee_id = session.user.id
        }
        if (status === "OUT_FOR_DELIVERY") updateData.out_for_delivery_at = new Date()
        if (status === "DELIVERED") {
          updateData.delivered_at = new Date()
        }

        const updated = await tx.order.update({
          where: { id: orderId },
          data: updateData,
        })

        // Loyalty Logic (DELIVERED)
        if (status === "DELIVERED" && restDb?.loyalty_enabled) {
          const eligibleAmount = Math.max(0, updated.total - updated.delivery_fee)
          const earnedPoints = Math.floor(eligibleAmount / restDb.loyalty_amount_for_one_point)
          if (earnedPoints > 0) {
            try {
              await earnPointsTransaction(tx, updated.customer_id, updated.restaurant_id, updated.id, earnedPoints, `Earned for order #${updated.order_number}`)
              await tx.order.update({ where: { id: updated.id }, data: { points_earned: earnedPoints } })
              updated.points_earned = earnedPoints
            } catch (e) {
              console.error("Failed to earn points (already earned?):", e)
            }
          }
        }

        // Loyalty Reversals (CANCELLED / REJECTED)
        if (status === "CANCELLED" || status === "REJECTED") {
          if (updated.points_redeemed > 0) {
            try {
              await reversePointsTransaction(tx, updated.customer_id, updated.restaurant_id, updated.id, "REFUND", updated.points_redeemed, `Refunded for cancelled order #${updated.order_number}`)
            } catch (e) {
              console.error("Failed to refund points (already refunded?):", e)
            }
          }
          if (updated.points_earned > 0) {
            try {
              await reversePointsTransaction(tx, updated.customer_id, updated.restaurant_id, updated.id, "REVERSAL", updated.points_earned, `Reversed for cancelled order #${updated.order_number}`)
              await tx.order.update({ where: { id: updated.id }, data: { points_earned: 0 } })
              updated.points_earned = 0
            } catch (e) {
              console.error("Failed to reverse points (already reversed?):", e)
            }
          }
        }

        // Order status history
        await tx.orderStatusHistory.create({
          data: {
            order_id: order.id,
            from_status: order.status,
            to_status: status as OrderStatus,
            changed_by: session.user.id,
            reason,
          },
        })

        return updated
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    )

    // Fire notifications asynchronously outside transaction (doesn't block response)
    const phone = updatedOrder.customer_phone_snapshot
    switch (updatedOrder.status) {
      case "IN_PROCESS":
        notificationService.sendOrderAccepted(updatedOrder, phone).catch(console.error)
        break
      case "OUT_FOR_DELIVERY":
        notificationService.sendOrderOutForDelivery(updatedOrder, phone).catch(console.error)
        break
      case "DELIVERED":
        notificationService.sendOrderDelivered(updatedOrder, phone).catch(console.error)
        break
      case "REJECTED":
        notificationService.sendOrderRejected(updatedOrder, phone, reason).catch(console.error)
        break
    }

    return NextResponse.json(updatedOrder)
  } catch (error: any) {
    console.error("Order Status Update Error:", error)
    const statusHttp = error.message?.includes("Insufficient inventory stock") ? 400 : 500
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: statusHttp }
    )
  }
}
