"use client"

import { useEffect, useState, useCallback } from "react"

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

type PermissionState = "default" | "granted" | "denied" | "unsupported"

// ─────────────────────────────────────────────────────────────────────────────
// PushNotificationManager
// • Registers the service worker once
// • If permission already granted, silently resubscribes (idempotent upsert on server)
// • Shows the permission banner only when permission is "default" and user hasn't dismissed it
// • NEVER shows the browser permission prompt more than once per browser
// ─────────────────────────────────────────────────────────────────────────────
export default function PushNotificationManager() {
  const [permissionState, setPermissionState] = useState<PermissionState>("default")
  const [dismissed, setDismissed] = useState(false)

  /**
   * Sends the push subscription to the server (upsert — safe to call multiple times).
   */
  const sendSubscriptionToServer = useCallback(async (subscription: PushSubscription) => {
    const subJson = subscription.toJSON()
    try {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      })
      localStorage.setItem("push_subscribed", "true")
      console.log("[PushManager] Subscription saved to server.")
    } catch (err) {
      console.error("[PushManager] Failed to save subscription to server:", err)
    }
  }, [])

  /**
   * Subscribes the browser to push notifications.
   * Reuses an existing subscription if one already exists — prevents duplicates.
   */
  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      // This means VAPID_PUBLIC_KEY was not set at build time.
      // On Vercel: Settings → Environment Variables → add VAPID_PUBLIC_KEY, then redeploy.
      console.warn(
        "[PushManager] VAPID_PUBLIC_KEY not set.\n" +
          "For Vercel: Add VAPID_PUBLIC_KEY to your project environment variables and redeploy.\n" +
          "For local dev: Ensure it is in .env and restart the dev server."
      )
      return
    }

    try {
      const reg = await navigator.serviceWorker.ready
      let subscription = await reg.pushManager.getSubscription()

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        console.log("[PushManager] New subscription created.")
      } else {
        console.log("[PushManager] Reusing existing subscription.")
      }

      await sendSubscriptionToServer(subscription)
      setPermissionState("granted")
    } catch (err) {
      console.error("[PushManager] Failed to subscribe:", err)
    }
  }, [sendSubscriptionToServer])

  /**
   * Called when user clicks "Enable" on the banner.
   * Requests browser permission exactly once — once denied, we never ask again.
   */
  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported")
      return
    }

    const perm = await Notification.requestPermission()
    if (perm === "granted") {
      await subscribe()
    } else {
      // User denied or dismissed — persist so we never ask again
      localStorage.setItem("push_permission_result", perm)
      setPermissionState(perm === "denied" ? "denied" : "default")
    }
  }, [subscribe])

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported")
      return
    }

    const currentPerm = Notification.permission as PermissionState
    setPermissionState(currentPerm)

    // Check persisted banner-dismissed state
    if (localStorage.getItem("push_banner_dismissed") === "true") {
      setDismissed(true)
    }

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        console.log("[PushManager] Service worker registered:", reg.scope)

        if (currentPerm === "granted") {
          // Silently resubscribe — idempotent, no UI shown
          await subscribe()
        }
      })
      .catch((err) => console.error("[PushManager] SW registration failed:", err))
  }, [subscribe])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem("push_banner_dismissed", "true")
  }

  // Do not render the banner if:
  // - permission already granted / denied / unsupported
  // - user dismissed the banner
  // - VAPID key not configured (dev mode without env var)
  if (
    permissionState === "granted" ||
    permissionState === "unsupported" ||
    permissionState === "denied" ||
    dismissed ||
    !VAPID_PUBLIC_KEY
  ) {
    return null
  }

  return (
    <div
      className="fixed bottom-20 right-4 z-50 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl shadow-lg px-4 py-3 max-w-sm"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">🔔</span>
        <div>
          <p className="font-semibold text-indigo-900 text-sm">Enable Push Notifications</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            Get instant alerts even when this tab is in the background.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 ml-2 flex-shrink-0">
        <button
          id="push-enable-btn"
          onClick={requestPermissionAndSubscribe}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1 text-indigo-500 hover:text-indigo-700 text-xs font-medium text-center"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
