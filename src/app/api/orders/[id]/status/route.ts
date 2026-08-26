import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notificationService } from "@/lib/notifications"
import { OrderStatus } from "@prisma/client"

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

    if (!status || !Object.values(OrderStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Run transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId, restaurant_id: restaurantId },
      })

      if (!order) {
        throw new Error("Order not found or unauthorized")
      }

      // Enforce State Machine Transitions
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
        throw new Error(`Invalid state transition from ${order.status} to ${status}`)
      }

      // Determine timestamps
      const updateData: any = { status }
      if (status === "IN_PROCESS") updateData.accepted_at = new Date()
      if (status === "OUT_FOR_DELIVERY") updateData.out_for_delivery_at = new Date()
      if (status === "DELIVERED") {
        updateData.delivered_at = new Date()
        // If your business logic strictly considers DELIVERED as COD collected:
        // updateData.payment_status = "PAID"
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: updateData,
      })

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
    })

    // Fire notifications asynchronously (don't block the response)
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
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
