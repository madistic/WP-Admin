"use client"

import { useState, useEffect, useCallback } from "react"
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

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REJECTED", label: "Rejected" },
]

export default function HistoryPage() {
  const [orders, setOrders] = useState<PastOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<PastOrder | null>(null)

  // Filters
  const [status, setStatus] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [search, setSearch] = useState("")

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set("status", status)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (search.trim()) params.set("search", search.trim())

      const res = await fetch(`/api/orders/history?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data)
        setSelectedOrder(null)
      }
    } catch (err) {
      console.error("Failed to load history", err)
    } finally {
      setLoading(false)
    }
  }, [status, dateFrom, dateTo, search])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Order Audit Log & History</h1>
        <p className="text-slate-500 text-xs font-normal mt-0.5">
          Archived timeline of all delivered, cancelled, and rejected restaurant orders.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-wrap gap-3 items-end">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Search</label>
          <input
            type="text"
            placeholder="Order #, customer name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchHistory()}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={() => { setStatus(""); setDateFrom(""); setDateTo(""); setSearch("") }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading…</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <li className="p-8 text-center text-slate-500 text-xs font-normal">No orders match the current filters.</li>
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
                          {new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
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
