import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { notificationService } from "@/lib/notifications"

// This can be triggered by Vercel Cron or any other external scheduler (e.g. GitHub Actions, AWS EventBridge)
export async function GET(request: Request) {
  try {
    // Optional: Add a simple secret check to protect this endpoint
    // const authHeader = request.headers.get('authorization')
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 })
    // }

    const minutesToWait = parseInt(process.env.AUTO_DELIVER_AFTER_MINUTES || "40", 10)
    
    // Find orders that are OUT_FOR_DELIVERY and the out_for_delivery_at was more than `minutesToWait` minutes ago
    const cutoffTime = new Date(Date.now() - minutesToWait * 60 * 1000)

    const pendingOrders = await prisma.order.findMany({
      where: {
        status: "OUT_FOR_DELIVERY",
        out_for_delivery_at: {
          lte: cutoffTime
        }
      }
    })

    if (pendingOrders.length === 0) {
      return NextResponse.json({ message: "No orders to auto-deliver" })
    }

    const processedOrders = []

    for (const order of pendingOrders) {
      // Process each in a separate transaction to avoid locking everything if one fails
      try {
        const updated = await prisma.$transaction(async (tx) => {
          // Double check the status to ensure idempotency
          const currentOrder = await tx.order.findUnique({
            where: { id: order.id }
          })
          
          if (currentOrder?.status !== "OUT_FOR_DELIVERY") {
            return null // Already processed
          }

          const deliveredOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              status: "DELIVERED",
              delivered_at: new Date(),
            }
          })

          await tx.orderStatusHistory.create({
            data: {
              order_id: order.id,
              from_status: "OUT_FOR_DELIVERY",
              to_status: "DELIVERED",
              reason: `Auto-delivered after ${minutesToWait} minutes`,
              changed_by: "SYSTEM",
            }
          })

          return deliveredOrder
        })

        if (updated) {
          processedOrders.push(updated)
          // Fire notification asynchronously
          notificationService.sendOrderDelivered(updated, updated.customer_phone_snapshot).catch(console.error)
        }
      } catch (err) {
        console.error(`Failed to auto-deliver order ${order.id}`, err)
      }
    }

    return NextResponse.json({
      message: `Auto-delivered ${processedOrders.length} orders`,
      orderIds: processedOrders.map(o => o.order_number)
    })
  } catch (error: any) {
    console.error("Auto Deliver Cron Error:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
