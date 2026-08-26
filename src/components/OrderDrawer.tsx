"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type OrderItem = {
  id: string
  menu_item_id: string
  item_name_snapshot: string
  unit_price_snapshot: number
  quantity: number
  description?: string | null
  line_total: number
}

type OrderHistory = {
  id: string
  from_status: string | null
  to_status: string
  reason: string | null
  created_at: string
}

type CustomerInfo = {
  id: string
  name: string
  phone: string
  email?: string | null
  created_at: string
  addresses: any[]
  notes?: any[]
  orders?: Array<{ id: string; total: number; created_at: string }>
}

type Order = {
  id: string
  order_number: string
  customer_name_snapshot: string
  customer_phone_snapshot: string
  delivery_address_snapshot: string
  subtotal: number
  delivery_fee: number
  total: number
  payment_method: string
  payment_status: string
  status: "NEW" | "IN_PROCESS" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "REJECTED"
  source: string
  created_at: string
  accepted_at?: string | null
  out_for_delivery_at?: string | null
  delivered_at?: string | null
  items: OrderItem[]
  history?: OrderHistory[]
  customer?: CustomerInfo
}

interface OrderDrawerProps {
  orderId: string | null
  onClose: () => void
  onStatusUpdate: (orderId: string, newStatus: string, reason?: string) => Promise<void>
}

export default function OrderDrawer({ orderId, onClose, onStatusUpdate }: OrderDrawerProps) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectModal, setShowRejectModal] = useState(false)

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      return
    }
    fetchOrderDetails(orderId)
  }, [orderId])

  async function fetchOrderDetails(id: string) {
    try {
      setLoading(true)
      const res = await fetch(`/api/orders/${id}`)
      if (res.ok) {
        const data = await res.json()
        setOrder(data)
      }
    } catch (e) {
      console.error("Failed to load order details", e)
    } finally {
      setLoading(false)
    }
  }

  if (!orderId) return null

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "NEW":
        return <span className="px-2.5 py-0.5 bg-purple-100 text-purple-900 border border-purple-300 font-semibold text-xs rounded-full">🟣 New</span>
      case "IN_PROCESS":
        return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs rounded-full">🟠 In Process</span>
      case "OUT_FOR_DELIVERY":
        return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 font-semibold text-xs rounded-full">🔵 Out for Delivery</span>
      case "DELIVERED":
        return <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold text-xs rounded-full">🟢 Delivered</span>
      case "CANCELLED":
        return <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 font-semibold text-xs rounded-full">🔴 Cancelled</span>
      case "REJECTED":
        return <span className="px-2.5 py-0.5 bg-slate-200 text-slate-900 border border-slate-400 font-semibold text-xs rounded-full">⚫ Rejected</span>
      default:
        return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 font-semibold text-xs rounded-full">{status}</span>
    }
  }

  async function handleAction(newStatus: string) {
    if (!order) return
    setUpdating(true)
    try {
      await onStatusUpdate(order.id, newStatus, newStatus === "REJECTED" ? rejectReason : undefined)
      await fetchOrderDetails(order.id)
    } finally {
      setUpdating(false)
      setShowRejectModal(false)
    }
  }

  // Calculate customer LTV & orders count
  const customerTotalOrders = order?.customer?.orders?.length || 1
  const customerLTV = order?.customer?.orders?.reduce((acc, curr) => acc + curr.total, 0) || order?.total || 0
  const customerSince = order?.customer?.created_at
    ? new Date(order.customer.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "Recent"

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 border-l border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{order?.order_number || "Order Details"}</h2>
              {order && getStatusBadge(order.status)}
            </div>
            {order && (
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Placed on {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} at{" "}
                {new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex-1 p-8 text-center text-slate-500 font-medium text-xs">Loading order details...</div>
        ) : !order ? (
          <div className="flex-1 p-8 text-center text-slate-500 font-medium text-xs">Order not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-normal">
            {/* Quick Action Bar */}
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider">Primary Action</span>
                <span className="text-[11px] text-indigo-700 font-medium">Source: {order.source}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {order.status === "NEW" && (
                  <>
                    <button
                      disabled={updating}
                      onClick={() => handleAction("IN_PROCESS")}
                      className="px-4 py-2 bg-indigo-600 text-white font-medium text-xs rounded-lg hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50"
                    >
                      ✓ Accept Order
                    </button>
                    <button
                      disabled={updating}
                      onClick={() => setShowRejectModal(true)}
                      className="px-4 py-2 bg-rose-600 text-white font-medium text-xs rounded-lg hover:bg-rose-700 shadow-xs transition-colors disabled:opacity-50"
                    >
                      ✕ Reject Order
                    </button>
                  </>
                )}

                {order.status === "IN_PROCESS" && (
                  <button
                    disabled={updating}
                    onClick={() => handleAction("OUT_FOR_DELIVERY")}
                    className="px-4 py-2 bg-blue-600 text-white font-medium text-xs rounded-lg hover:bg-blue-700 shadow-xs transition-colors disabled:opacity-50"
                  >
                    🚀 Dispatch Order
                  </button>
                )}

                {order.status === "OUT_FOR_DELIVERY" && (
                  <button
                    disabled={updating}
                    onClick={() => handleAction("DELIVERED")}
                    className="px-4 py-2 bg-emerald-600 text-white font-medium text-xs rounded-lg hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50"
                  >
                    🎉 Mark Delivered
                  </button>
                )}

                <a
                  href={`tel:${order.customer_phone_snapshot}`}
                  className="px-3 py-2 bg-white border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  📞 Call
                </a>
                <a
                  href={`https://wa.me/${order.customer_phone_snapshot.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-emerald-600 text-white font-medium text-xs rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                >
                  💬 WhatsApp
                </a>
              </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <label className="block text-xs font-semibold text-rose-900">Reason for Rejecting Order</label>
                <input
                  type="text"
                  placeholder="e.g. Item out of stock, Kitchen closed"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-2 border border-rose-300 rounded-md text-xs text-slate-900 bg-white"
                />
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setShowRejectModal(false)}
                    className="px-3 py-1.5 bg-slate-200 text-slate-800 font-medium text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAction("REJECTED")}
                    className="px-3 py-1.5 bg-rose-600 text-white font-medium text-xs rounded-lg hover:bg-rose-700"
                  >
                    Confirm Reject
                  </button>
                </div>
              </div>
            )}

            {/* Customer & Address Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Box */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-xs">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer Info</h3>
                  {order.customer?.id && (
                    <Link
                      href={`/customers/${order.customer.id}`}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      View 360° Profile &rarr;
                    </Link>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900">{order.customer_name_snapshot}</p>
                <p className="text-xs font-mono text-slate-600">📱 {order.customer_phone_snapshot}</p>
                <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                  <p>Customer Since: <span className="font-semibold text-slate-900">{customerSince}</span></p>
                  <p>Total Orders: <span className="font-semibold text-slate-900">{customerTotalOrders}</span></p>
                  <p>Total Spent: <span className="font-semibold text-slate-900">₹{customerLTV.toFixed(2)}</span></p>
                </div>
              </div>

              {/* Address Box */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-xs">
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Delivery Address</h3>
                <p className="text-xs font-normal text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                  📍 {order.delivery_address_snapshot}
                </p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(order.delivery_address_snapshot)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-medium text-indigo-600 hover:underline pt-0.5"
                >
                  🗺️ View on Google Maps
                </a>
              </div>
            </div>

            {/* Order Items Breakdown */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-xs">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Order Items ({order.items.length})
              </h3>

              <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
                {order.items.map((item) => (
                  <div key={item.id} className="py-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {item.quantity} × {item.item_name_snapshot}
                        </p>
                        <p className="text-[11px] text-slate-500">₹{item.unit_price_snapshot.toFixed(2)} each</p>
                      </div>
                      <p className="text-xs font-semibold text-slate-900">₹{item.line_total.toFixed(2)}</p>
                    </div>

                    {/* Instruction Display */}
                    {item.description && (
                      <p className="text-[11px] text-indigo-700 bg-indigo-50/70 p-1.5 rounded border border-indigo-100 font-medium">
                        📝 Instruction: {item.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Pricing Breakdown */}
              <div className="space-y-1.5 text-xs pt-2">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee</span>
                  <span>₹{order.delivery_fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-900 border-t border-slate-200 pt-2">
                  <span>Total Amount</span>
                  <span className="text-indigo-600">₹{order.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-emerald-700 pt-1">
                  <span>Payment Method</span>
                  <span className="uppercase">{order.payment_method} ({order.payment_status})</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
