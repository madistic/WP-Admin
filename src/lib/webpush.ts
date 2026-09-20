import webpush from "web-push"
import prisma from "@/lib/prisma"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@restopro.app"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
  orderId?: string
  requireInteraction?: boolean
}

/**
 * Sends a push notification to ALL subscribed browsers for the given restaurant.
 * Stale / expired subscriptions are automatically removed from the DB.
 */
export async function sendPushToRestaurant(
  restaurantId: string,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[WebPush] VAPID keys not configured — skipping push.")
    return
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { restaurant_id: restaurantId },
  })

  if (subscriptions.length === 0) return

  const payloadStr = JSON.stringify(payload)
  const staleIds: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        )
      } catch (err: any) {
        // 410 Gone / 404 Not Found = subscription expired/unsubscribed
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id)
        } else {
          console.warn(`[WebPush] Failed to deliver push to ${sub.endpoint.slice(-20)}: ${err?.message}`)
        }
      }
    })
  )

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } })
    console.log(`[WebPush] Removed ${staleIds.length} stale subscription(s) for restaurant ${restaurantId}`)
  }
}
