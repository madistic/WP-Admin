"use client"

import { useEffect, useState, useRef } from "react"
import { Toaster, toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

export default function OrderAlertProvider() {
  const router = useRouter()
  // Only alert for orders that arrive AFTER the dashboard is loaded.
  const [sinceTime] = useState<string>(new Date().toISOString())
  const alertedOrderIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    async function pollLatestOrders() {
      try {
        const res = await fetch(`/api/orders/latest?since=${encodeURIComponent(sinceTime)}`)
        if (res.ok) {
          const newOrders: any[] = await res.json()
          newOrders.forEach((order) => {
            if (!alertedOrderIds.current.has(order.id)) {
              alertedOrderIds.current.add(order.id)
              
              toast((t) => (
                <div className="flex flex-col gap-2 cursor-pointer" onClick={() => {
                  toast.dismiss(t.id)
                  router.push("/dashboard")
                }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚨</span>
                    <span className="font-bold text-slate-900">New Order: {order.order_number}</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {order.customer_name_snapshot} placed an order for ₹{order.total.toFixed(2)}
                  </p>
                  <button className="mt-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md hover:bg-indigo-100 self-start">
                    View in Dashboard
                  </button>
                </div>
              ), {
                duration: 30000, // 30 seconds
                position: 'top-center',
                style: {
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  minWidth: '300px',
                },
              })
            }
          })
        }
      } catch (err) {
        // Ignore network errors in polling silently
      }

      timeoutId = setTimeout(pollLatestOrders, 10000) // 10 seconds
    }

    pollLatestOrders()

    return () => clearTimeout(timeoutId)
  }, [sinceTime, router])

  return (
    <>
      <Toaster />
    </>
  )
}
