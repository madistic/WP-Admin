"use client"

import { useState, useEffect } from "react"
import OrderDrawer from "./OrderDrawer"
import StatusBadge from "./StatusBadge"

type OrderItem = {
  id: string
  menu_item_id: string
  item_name_snapshot: string
  unit_price_snapshot: number
  quantity: number
  line_total: number
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
  items: OrderItem[]
  customer?: any
}

export default function OrderBoard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  // Filtering & Sorting State
  const [activeTab, setActiveTab] = useState("ALL")
  const [selectedDateMode, setSelectedDateMode] = useState<"TODAY" | "YESTERDAY" | "CUSTOM">("TODAY")
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST" | "HIGHEST" | "LOWEST">("NEWEST")
  const [showFilterDrawer, setShowFilterDrawer] = useState(false)
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("ALL")
  const [filterMinAmount, setFilterMinAmount] = useState("")
  const [filterMaxAmount, setFilterMaxAmount] = useState("")

  // Drawer Inspection
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders")
      if (res.ok) {
        const data = await res.json()
        setOrders(data)
      }
    } catch (e) {
      console.error("Failed to fetch orders", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  const updateStatus = async (orderId: string, newStatus: string, reason?: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      })
      if (res.ok) {
        await fetchOrders()
      } else {
        const err = await res.json()
        alert(`Failed to update status: ${err.error || "Unknown error"}`)
      }
    } catch (e) {
      console.error("Status update error", e)
    }
  }

  const navigateDay = (offset: number) => {
    const nextDate = new Date(currentDate)
    nextDate.setDate(nextDate.getDate() + offset)
    setCurrentDate(nextDate)
    setSelectedDateMode("CUSTOM")
    setCustomDate(nextDate.toISOString().split("T")[0])
  }

  // Date Filtering Helper
  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }

  const dateFilteredOrders = orders.filter((o) => {
    const orderDate = new Date(o.created_at)
    if (selectedDateMode === "TODAY") {
      return isSameDay(orderDate, new Date())
    } else if (selectedDateMode === "YESTERDAY") {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      return isSameDay(orderDate, y)
    } else {
      const target = new Date(customDate)
      return isSameDay(orderDate, target)
    }
  })

  // Summary Metrics for Active Selected Day
  const summaryTotalOrders = dateFilteredOrders.length
  const summaryNewOrders = dateFilteredOrders.filter((o) => o.status === "NEW").length
  const summaryInProcess = dateFilteredOrders.filter((o) => o.status === "IN_PROCESS").length
  const summaryOutForDelivery = dateFilteredOrders.filter((o) => o.status === "OUT_FOR_DELIVERY").length
  const summaryDelivered = dateFilteredOrders.filter((o) => o.status === "DELIVERED").length
  const summaryRevenue = dateFilteredOrders
    .filter((o) => o.status === "DELIVERED")
    .reduce((sum, o) => sum + o.total, 0)

  // Status Tab & Search & Amount Filter
  const filteredOrders = dateFilteredOrders.filter((o) => {
    // 1. Status Tab
    if (activeTab !== "ALL" && o.status !== activeTab) return false

    // 2. Search
    if (search.trim() !== "") {
      const s = search.toLowerCase()
      const matchId = o.order_number.toLowerCase().includes(s)
      const matchName = o.customer_name_snapshot.toLowerCase().includes(s)
      const matchPhone = o.customer_phone_snapshot.includes(s)
      if (!matchId && !matchName && !matchPhone) return false
    }

    // 3. Payment Method
    if (filterPaymentMethod !== "ALL" && o.payment_method !== filterPaymentMethod) return false

    // 4. Amount Range
    if (filterMinAmount && o.total < parseFloat(filterMinAmount)) return false
    if (filterMaxAmount && o.total > parseFloat(filterMaxAmount)) return false

    return true
  })

  // Sorting
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === "NEWEST") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sortBy === "OLDEST") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === "HIGHEST") return b.total - a.total
    if (sortBy === "LOWEST") return a.total - b.total
    return 0
  })

  if (loading && orders.length === 0) {
    return <div className="p-8 text-center text-slate-500 font-medium text-sm">Loading orders management board...</div>
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* 1. Date Navigation */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateDay(-1)}
            className="px-3 py-1.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors"
          >
            ‹ Previous Day
          </button>
          <span className="text-xs font-semibold text-slate-900 px-1">
            {selectedDateMode === "TODAY"
              ? `Today (${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`
              : selectedDateMode === "YESTERDAY"
              ? "Yesterday"
              : new Date(customDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
          <button
            onClick={() => navigateDay(1)}
            className="px-3 py-1.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors"
          >
            Next Day ›
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSelectedDateMode("TODAY")
              setCurrentDate(new Date())
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedDateMode === "TODAY"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => {
              setSelectedDateMode("YESTERDAY")
              const y = new Date()
              y.setDate(y.getDate() - 1)
              setCurrentDate(y)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedDateMode === "YESTERDAY"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Yesterday
          </button>
          <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 py-1 bg-white">
            <span className="text-xs font-medium text-slate-500">Date:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value)
                setSelectedDateMode("CUSTOM")
                setCurrentDate(new Date(e.target.value))
              }}
              className="text-xs font-normal text-slate-900 border-none outline-none"
            />
          </div>
        </div>
      </div>

      {/* 2. Compact Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-200">
          <p className="text-xs font-medium text-slate-500">Total Orders</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{summaryTotalOrders}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-purple-200 bg-purple-50/40">
          <p className="text-xs font-medium text-purple-800">New Orders</p>
          <p className="text-xl font-semibold text-purple-900 mt-1">{summaryNewOrders}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-amber-200 bg-amber-50/40">
          <p className="text-xs font-medium text-amber-800">In Process</p>
          <p className="text-xl font-semibold text-amber-900 mt-1">{summaryInProcess}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-blue-200 bg-blue-50/40">
          <p className="text-xs font-medium text-blue-800">Out for Delivery</p>
          <p className="text-xl font-semibold text-blue-900 mt-1">{summaryOutForDelivery}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-emerald-200 bg-emerald-50/40">
          <p className="text-xs font-medium text-emerald-800">Delivered</p>
          <p className="text-xl font-semibold text-emerald-900 mt-1">{summaryDelivered}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-indigo-200 bg-indigo-50/40">
          <p className="text-xs font-medium text-indigo-800">Revenue</p>
          <p className="text-xl font-semibold text-indigo-900 mt-1">₹{summaryRevenue.toFixed(0)}</p>
        </div>
      </div>

      {/* 3. Status Tabs */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-1.5 flex flex-wrap gap-1">
        {[
          { id: "ALL", label: "All", count: dateFilteredOrders.length },
          { id: "NEW", label: "New", count: dateFilteredOrders.filter((o) => o.status === "NEW").length },
          { id: "IN_PROCESS", label: "In Process", count: dateFilteredOrders.filter((o) => o.status === "IN_PROCESS").length },
          { id: "OUT_FOR_DELIVERY", label: "Out for Delivery", count: dateFilteredOrders.filter((o) => o.status === "OUT_FOR_DELIVERY").length },
          { id: "DELIVERED", label: "Delivered", count: dateFilteredOrders.filter((o) => o.status === "DELIVERED").length },
          { id: "CANCELLED", label: "Cancelled", count: dateFilteredOrders.filter((o) => o.status === "CANCELLED").length },
          { id: "REJECTED", label: "Rejected", count: dateFilteredOrders.filter((o) => o.status === "REJECTED").length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                activeTab === tab.id ? "bg-white text-indigo-700" : "bg-slate-200 text-slate-700"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 4. Search & Controls */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80 relative">
          <input
            type="text"
            placeholder="Search Order ID, Customer or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 text-slate-900 bg-white"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="text-xs font-medium text-slate-900 border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-indigo-600"
            >
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="HIGHEST">Highest Amount</option>
              <option value="LOWEST">Lowest Amount</option>
            </select>
          </div>

          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              showFilterDrawer
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>⚙️ Filters</span>
          </button>
        </div>
      </div>

      {showFilterDrawer && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-normal">
          <div>
            <label className="block text-slate-700 mb-1 font-medium">Payment Method</label>
            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              <option value="ALL">All Payment Methods</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-700 mb-1 font-medium">Min Order Amount (₹)</label>
            <input
              type="number"
              placeholder="e.g. 200"
              value={filterMinAmount}
              onChange={(e) => setFilterMinAmount(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1 font-medium">Max Order Amount (₹)</label>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={filterMaxAmount}
              onChange={(e) => setFilterMaxAmount(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
            />
          </div>
        </div>
      )}

      {/* 5. Orders Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        {sortedOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-medium text-xs">
            No orders match the selected filters or date.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-normal">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Order ID & Time</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Delivery Address</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Order Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Primary Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 text-sm">{order.order_number}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-900">{order.customer_name_snapshot}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">{order.customer_phone_snapshot}</p>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-slate-600 line-clamp-2 leading-relaxed">
                        {order.delivery_address_snapshot}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 font-medium text-slate-700 text-[11px] rounded-md">
                        {order.items.length} item(s)
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 text-sm">₹{order.total.toFixed(2)}</p>
                      <span className="text-[10px] text-slate-400 uppercase">{order.payment_method} ({order.payment_status})</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={order.status} />
                    </td>

                    <td
                      className="py-3.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.status === "NEW" && (
                        <button
                          onClick={() => updateStatus(order.id, "IN_PROCESS")}
                          className="px-3 py-1 bg-indigo-600 text-white font-medium text-xs rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                        >
                          Accept
                        </button>
                      )}

                      {order.status === "IN_PROCESS" && (
                        <button
                          onClick={() => updateStatus(order.id, "OUT_FOR_DELIVERY")}
                          className="px-3 py-1 bg-blue-600 text-white font-medium text-xs rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
                        >
                          Dispatch
                        </button>
                      )}

                      {order.status === "OUT_FOR_DELIVERY" && (
                        <button
                          onClick={() => updateStatus(order.id, "DELIVERED")}
                          className="px-3 py-1 bg-emerald-600 text-white font-medium text-xs rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
                        >
                          Deliver
                        </button>
                      )}

                      {(order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "REJECTED") && (
                        <span className="text-xs font-normal text-slate-400">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onStatusUpdate={updateStatus}
      />
    </div>
  )
}
