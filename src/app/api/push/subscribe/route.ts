import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/push/subscribe
 * Saves a browser push subscription for the current user's restaurant.
 * Idempotent — upserts by endpoint so duplicate subscriptions are not stored.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint, keys } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 })
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        restaurant_id: session.user.restaurant_id,
        user_id: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      update: {
        restaurant_id: session.user.restaurant_id,
        user_id: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Push Subscribe] Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

/**
 * DELETE /api/push/subscribe
 * Removes a push subscription (user unsubscribed).
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 })
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, restaurant_id: session.user.restaurant_id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Push Unsubscribe] Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
