"use client"

import { useState, useEffect } from "react"
import StatusBadge from "@/components/StatusBadge"

interface HistoryEvent {
  id: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  reason: string | null
  created_at: string
}

interface OrderItem {
  id: string
  item_name_snapshot: string
  quantity: number
  line_total: number
}

interface PastOrder {
  id: string
  order_number: string
  customer_name_snapshot: string
  customer_phone_snapshot: string
  delivery_address_snapshot: string
  total: number
  status: string
  created_at: string
  items: OrderItem[]
  history: HistoryEvent[]
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<PastOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<PastOrder | null>(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch("/api/orders/history")
      if (res.ok) {
        const data = await res.json()
        setOrders(data)
      }
    } catch (err) {
      console.error("Failed to load history", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading order audit history...</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Order Audit Log & History</h1>
        <p className="text-slate-500 text-xs font-normal mt-0.5">
          Archived timeline of all delivered, cancelled, and rejected restaurant orders.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <li className="p-8 text-center text-slate-500 text-xs font-normal">No archived order history found.</li>
            ) : (
              orders.map((o) => (
                <li
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                    selectedOrder?.id === o.id ? "bg-indigo-50/50" : ""
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{o.order_number}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="text-xs text-slate-700 font-medium mt-1">{o.customer_name_snapshot}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{o.customer_phone_snapshot}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-slate-900">₹{o.total.toFixed(2)}</span>
                      <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                        {new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Selected Order Audit Detail */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">Order History Timeline</h2>

          {!selectedOrder ? (
            <p className="text-xs text-slate-400 font-normal">Select an order from the list to view its audit history.</p>
          ) : (
            <div className="space-y-4 text-xs font-normal">
              <div>
                <span className="text-slate-400 text-[11px] block">Order Identifier</span>
                <span className="font-semibold text-slate-900 text-sm">{selectedOrder.order_number}</span>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block">Items</span>
                <p className="text-slate-700 mt-0.5">
                  {selectedOrder.items.map((i) => `${i.quantity}x ${i.item_name_snapshot}`).join(", ")}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-900 block mb-3">Status Transitions</span>
                {selectedOrder.history.length === 0 ? (
                  <p className="text-slate-400 text-[11px]">No status log entries recorded.</p>
                ) : (
                  <div className="relative border-l border-slate-200 ml-2 space-y-4">
                    {selectedOrder.history.map((h) => (
                      <div key={h.id} className="ml-4 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-900">
                            {h.from_status ? `${h.from_status} → ` : ""}{h.to_status}
                          </span>
                        </div>
                        <time className="text-[10px] text-slate-400 block">
                          {new Date(h.created_at).toLocaleString()}
                        </time>
                        {h.reason && <p className="text-[11px] text-rose-600 bg-rose-50 p-1.5 rounded mt-1">Reason: {h.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
