"use client"

import { useEffect, useState, useCallback } from "react"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

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

export default function PushNotificationManager() {
  const [permissionState, setPermissionState] = useState<PermissionState>("default")
  const [dismissed, setDismissed] = useState(false)

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[PushManager] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set.")
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
      }
      const subJson = subscription.toJSON()
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      })
      setPermissionState("granted")
      localStorage.setItem("push_subscribed", "true")
      console.log("[PushManager] Subscribed to push notifications.")
    } catch (err) {
      console.error("[PushManager] Failed to subscribe:", err)
    }
  }, [])

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported")
      return
    }
    const perm = await Notification.requestPermission()
    if (perm === "granted") {
      await subscribe()
    } else {
      setPermissionState(perm === "denied" ? "denied" : "default")
    }
  }, [subscribe])

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported")
      return
    }
    setPermissionState(Notification.permission as PermissionState)
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async (reg) => {
      console.log("[PushManager] Service worker registered:", reg.scope)
      if (Notification.permission === "granted") {
        await subscribe()
      }
    }).catch((err) => console.error("[PushManager] SW registration failed:", err))
    const wasDismissed = localStorage.getItem("push_banner_dismissed")
    if (wasDismissed === "true") setDismissed(true)
  }, [subscribe])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem("push_banner_dismissed", "true")
  }

  if (permissionState === "granted" || permissionState === "unsupported" || permissionState === "denied" || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl shadow-lg px-4 py-3 max-w-sm" role="alert">
      <div className="flex items-start gap-3">
        <span className="text-xl">🔔</span>
        <div>
          <p className="font-semibold text-indigo-900 text-sm">Enable Push Notifications</p>
          <p className="text-xs text-indigo-700 mt-0.5">Get instant alerts even when this tab is in the background.</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 ml-2 flex-shrink-0">
        <button id="push-enable-btn" onClick={requestPermissionAndSubscribe} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap">Enable</button>
        <button onClick={handleDismiss} className="px-3 py-1 text-indigo-500 hover:text-indigo-700 text-xs font-medium text-center">Not now</button>
      </div>
    </div>
  )
}
