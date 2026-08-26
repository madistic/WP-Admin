"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { formatPhoneDisplay } from "@/lib/phone"

interface Address {
  id: string
  address_type: string
  label: string | null
  recipient_name: string | null
  phone_number: string | null
  address_line: string
  address_line_2: string | null
  landmark: string | null
  city: string | null
  state: string | null
  pincode: string | null
  delivery_instructions: string | null
  is_default: boolean
}

interface OrderItem {
  id: string
  item_name_snapshot: string
  unit_price_snapshot: number
  quantity: number
  line_total: number
}

interface Order {
  id: string
  order_number: string
  total: number
  subtotal: number
  delivery_fee: number
  payment_method: string
  status: string
  source: string
  delivery_address_snapshot: string
  created_at: string
  items: OrderItem[]
}

interface StaffNote {
  id: string
  note: string
  created_at: string
  user: { name: string } | null
}

interface Activity {
  id: string
  type: string
  description: string
  created_at: string
}

interface Customer360Data {
  id: string
  name: string
  phone: string
  email: string | null
  gender: string | null
  date_of_birth: string | null
  created_at: string
  last_order_at: string | null
  metrics: {
    totalOrdersCount: number
    completedOrdersCount: number
    ltv: number
    aov: number
    favoriteCategory: string
    segment: string
    firstOrderDate: string | null
    lastOrderDate: string | null
  }
  addresses: Address[]
  orders: Order[]
  staffNotes: StaffNote[]
  activities: Activity[]
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = use(params)
  const [customer, setCustomer] = useState<Customer360Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "addresses" | "activity" | "notes">("overview")

  // Selected Order Modal State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Add Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [addressForm, setAddressForm] = useState({
    address_type: "Home",
    address_line: "",
    landmark: "",
    city: "",
    pincode: "",
    delivery_instructions: "",
    is_default: false,
  })

  // Add Note Modal State
  const [newNoteText, setNewNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    fetchCustomer360()
  }, [customerId])

  async function fetchCustomer360() {
    try {
      const res = await fetch(`/api/customers/${customerId}`)
      if (res.ok) {
        const data = await res.json()
        setCustomer(data)
      }
    } catch (err) {
      console.error("Failed to load customer 360", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch(`/api/customers/${customerId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressForm),
      })
      if (res.ok) {
        setShowAddressModal(false)
        setAddressForm({
          address_type: "Home",
          address_line: "",
          landmark: "",
          city: "",
          pincode: "",
          delivery_instructions: "",
          is_default: false,
        })
        fetchCustomer360()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNoteText.trim()) return
    setAddingNote(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNoteText }),
      })
      if (res.ok) {
        setNewNoteText("")
        fetchCustomer360()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAddingNote(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Customer 360° Profile...</div>
  if (!customer) return <div className="p-8 text-center text-red-500">Customer not found</div>

  const cleanWhatsAppPhone = customer.phone.replace(/[^\d]/g, "")

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <Link href="/customers" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 mb-2">
          &larr; Back to Customers
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-inner">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                  {customer.metrics.segment}
                </span>
              </div>
              <p className="text-sm font-mono text-gray-600 mt-0.5">{formatPhoneDisplay(customer.phone)}</p>
              <p className="text-xs text-gray-400 mt-1">Customer since {new Date(customer.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`tel:${customer.phone}`}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-xs font-semibold text-gray-700 transition-colors"
            >
              📞 Call
            </a>
            <a
              href={`https://wa.me/${cleanWhatsAppPhone}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Customer Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">Total Orders</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{customer.metrics.completedOrdersCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">Total Spent (LTV)</span>
          <p className="text-xl font-bold text-indigo-600 mt-1">₹{customer.metrics.ltv.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">Avg Order Value</span>
          <p className="text-xl font-bold text-gray-900 mt-1">₹{customer.metrics.aov.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">Last Order</span>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {customer.metrics.lastOrderDate ? new Date(customer.metrics.lastOrderDate).toLocaleDateString() : "None"}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">First Order</span>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {customer.metrics.firstOrderDate ? new Date(customer.metrics.firstOrderDate).toLocaleDateString() : "None"}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
          <span className="text-xs font-semibold text-gray-400 uppercase">Fav Category</span>
          <p className="text-sm font-bold text-gray-900 mt-1 truncate" title={customer.metrics.favoriteCategory}>
            {customer.metrics.favoriteCategory}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 bg-white px-4 rounded-xl shadow-sm">
        <nav className="flex space-x-8 overflow-x-auto">
          {(["overview", "orders", "addresses", "activity", "notes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-600 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab} {tab === "orders" ? `(${customer.orders.length})` : tab === "notes" ? `(${customer.staffNotes.length})` : ""}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB CONTENT */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b pb-2">Customer Profile Information</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-gray-400 block">Full Name</span>
                <span className="font-semibold text-gray-800">{customer.name}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Phone Number</span>
                <span className="font-mono text-gray-800">{customer.phone}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Email Address</span>
                <span className="text-gray-800">{customer.email || "Not provided"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Customer ID</span>
                <span className="font-mono text-xs text-gray-600">#CUS-{customer.id}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b pb-2">Recent Orders (Latest 5)</h2>
            {customer.orders.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No orders placed yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {customer.orders.slice(0, 5).map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    className="py-3 flex justify-between items-center hover:bg-gray-50 cursor-pointer rounded-md px-2"
                  >
                    <div>
                      <span className="font-bold text-gray-900 text-sm">{o.order_number}</span>
                      <p className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</p>
                      <p className="text-xs text-gray-700 mt-0.5">
                        {o.items.map((i) => `${i.quantity}x ${i.item_name_snapshot}`).join(", ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-sm">₹{o.total.toFixed(2)}</p>
                      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 mt-1">
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. ORDERS TAB */}
      {activeTab === "orders" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {customer.orders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No orders yet.</div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase border-b">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.orders.map((o) => (
                  <tr key={o.id} onClick={() => setSelectedOrder(o)} className="hover:bg-indigo-50/40 cursor-pointer">
                    <td className="py-3 px-4 font-bold text-gray-900">{o.order_number}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs text-gray-700">
                      {o.items.map((i) => `${i.quantity}x ${i.item_name_snapshot}`).join(", ")}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">₹{o.total.toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs font-medium">{o.payment_method}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 3. ADDRESSES TAB */}
      {activeTab === "addresses" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-900">Saved Customer Addresses</h2>
            <button
              onClick={() => setShowAddressModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
            >
              + Add Address
            </button>
          </div>

          {customer.addresses.length === 0 ? (
            <div className="bg-white p-8 rounded-xl shadow-sm text-center text-gray-500">No saved addresses.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customer.addresses.map((a) => (
                <div key={a.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 uppercase">
                      {a.address_type}
                    </span>
                    {a.is_default && (
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">Default</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{a.address_line}</p>
                  {a.landmark && <p className="text-xs text-gray-500">Landmark: {a.landmark}</p>}
                  {a.city && <p className="text-xs text-gray-500">{a.city} {a.pincode}</p>}
                  {a.delivery_instructions && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                      Instructions: {a.delivery_instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. ACTIVITY TAB */}
      {activeTab === "activity" && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-base font-bold text-gray-900">Customer Activity Timeline</h2>
          {customer.activities.length === 0 ? (
            <p className="text-sm text-gray-400">No activity recorded.</p>
          ) : (
            <ol className="relative border-l border-gray-200 ml-3 space-y-6">
              {customer.activities.map((act) => (
                <li key={act.id} className="ml-6">
                  <span className="absolute flex items-center justify-center w-6 h-6 bg-indigo-100 rounded-full -left-3 ring-4 ring-white text-xs">
                    📌
                  </span>
                  <time className="block mb-1 text-xs font-normal leading-none text-gray-400">
                    {new Date(act.created_at).toLocaleString()}
                  </time>
                  <h3 className="text-sm font-semibold text-gray-900">{act.description}</h3>
                  <p className="text-xs text-gray-500 uppercase">{act.type}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 5. NOTES TAB */}
      {activeTab === "notes" && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-base font-bold text-gray-900">Internal Staff Notes (Private)</h2>
          <form onSubmit={handleAddNote} className="space-y-3">
            <textarea
              required
              rows={3}
              placeholder="Add internal note about customer preferences..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              className="w-full p-3 border rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={addingNote}
              className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {addingNote ? "Adding..." : "+ Add Note"}
            </button>
          </form>

          <div className="divide-y divide-gray-100">
            {customer.staffNotes.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No internal notes added.</p>
            ) : (
              customer.staffNotes.map((n) => (
                <div key={n.id} className="py-3">
                  <p className="text-sm text-gray-800">{n.note}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    By {n.user?.name || "Staff"} • {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ORDER DETAIL MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900">Order #{selectedOrder.order_number}</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Date: {new Date(selectedOrder.created_at).toLocaleString()}</span>
                <span className="font-bold text-green-600">{selectedOrder.status}</span>
              </div>

              <div className="border-t border-b py-3 space-y-2">
                <h4 className="font-semibold text-gray-700 text-xs uppercase">Order Items</h4>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.item_name_snapshot}</span>
                    <span>₹{item.line_total.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{selectedOrder.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Delivery Fee</span><span>₹{selectedOrder.delivery_fee.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t">
                  <span>Total</span><span>₹{selectedOrder.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <h4 className="font-semibold text-gray-700 text-xs uppercase mb-1">Historical Delivery Snapshot</h4>
                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">{selectedOrder.delivery_address_snapshot}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD ADDRESS MODAL */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900">Add New Address</h3>
              <button onClick={() => setShowAddressModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleAddAddress} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address Type</label>
                <select
                  value={addressForm.address_type}
                  onChange={(e) => setAddressForm({ ...addressForm, address_type: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="Home">Home</option>
                  <option value="Work">Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address Line *</label>
                <textarea
                  required
                  rows={2}
                  value={addressForm.address_line}
                  onChange={(e) => setAddressForm({ ...addressForm, address_line: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Landmark</label>
                <input
                  type="text"
                  value={addressForm.landmark}
                  onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    className="w-full p-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={addressForm.pincode}
                    onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                    className="w-full p-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Delivery Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Call when outside..."
                  value={addressForm.delivery_instructions}
                  onChange={(e) => setAddressForm({ ...addressForm, delivery_instructions: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={addressForm.is_default}
                  onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                />
                <label htmlFor="is_default" className="text-xs font-medium text-gray-700">Set as default address</label>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-medium text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                >
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
