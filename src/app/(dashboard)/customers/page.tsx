"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import StatusBadge from "@/components/StatusBadge"
import { formatPhoneDisplay } from "@/lib/phone"

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  totalSpent: number
  totalOrdersCount: number
  completedOrdersCount: number
  segment: string
  created_at: string
  last_order_at: string | null
}

interface Stats {
  totalCustomers: number
  newCustomers: number
  returningCustomers: number
  totalCustomerRevenue: number
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stats, setStats] = useState<Stats>({
    totalCustomers: 0,
    newCustomers: 0,
    returningCustomers: 0,
    totalCustomerRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [type, setType] = useState("all")
  const [ordersFilter, setOrdersFilter] = useState("all")
  const [spendingFilter, setSpendingFilter] = useState("all")
  const [sortBy, setSortBy] = useState("newest")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Add Customer Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: "", phone: "", email: "", default_address: "", notes: "" })
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchCustomers()
  }, [search, type, ordersFilter, spendingFilter, sortBy, page])

  async function fetchCustomers() {
    setLoading(true)
    try {
      const query = new URLSearchParams({
        search,
        type,
        orders: ordersFilter,
        spending: spendingFilter,
        sortBy,
        page: page.toString(),
        limit: "20",
      })

      const res = await fetch(`/api/customers?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers)
        setStats(data.stats)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || "Failed to create customer")
      } else {
        setShowAddModal(false)
        setAddForm({ name: "", phone: "", email: "", default_address: "", notes: "" })
        fetchCustomers()
      }
    } catch (err) {
      setAddError("An error occurred while creating customer")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Customer Management</h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            View customer profiles, ordering history, repeat frequencies, and address books.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
        >
          + Add Customer
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Customers</span>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.totalCustomers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">New (Single Order)</span>
          <p className="text-2xl font-semibold text-indigo-600 mt-1">{stats.newCustomers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Repeat Customers</span>
          <p className="text-2xl font-semibold text-emerald-600 mt-1">{stats.returningCustomers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500 font-sans">Total Customer LTV</span>
          <p className="text-2xl font-semibold text-slate-900 mt-1">₹{stats.totalCustomerRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="w-full md:w-80 relative">
            <input
              type="text"
              placeholder="Search Name or Phone (+91)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 text-slate-900 bg-white"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto text-xs font-normal">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setPage(1)
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              <option value="all">All Cohorts</option>
              <option value="new">New Customers</option>
              <option value="repeat">Repeat Customers</option>
            </select>

            <select
              value={ordersFilter}
              onChange={(e) => {
                setOrdersFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              <option value="all">All Orders Count</option>
              <option value="0">0 Orders</option>
              <option value="1">1 Order</option>
              <option value="2-5">2-5 Orders</option>
              <option value="5+">5+ Orders</option>
            </select>

            <select
              value={spendingFilter}
              onChange={(e) => {
                setSpendingFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              <option value="all">All Spend Ranges</option>
              <option value="<500">Under ₹500</option>
              <option value="500-2000">₹500 - ₹2,000</option>
              <option value="2000+">₹2,000+</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              <option value="newest">Newest Added</option>
              <option value="name">Name (A-Z)</option>
              <option value="highest_spent">Highest Spend</option>
              <option value="most_orders">Most Orders</option>
              <option value="recent_order">Recent Order Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading customer directory...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-normal text-xs">No customers match your criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-normal">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Completed Orders</th>
                  <th className="py-3 px-4 font-sans">Total Spent (LTV)</th>
                  <th className="py-3 px-4 font-sans">Avg Order Value</th>
                  <th className="py-3 px-4">Segment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const aov = c.completedOrdersCount > 0 ? c.totalSpent / c.completedOrdersCount : 0
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div>
                          <span>{c.name}</span>
                          {c.email && <p className="text-[11px] text-slate-400 font-normal">{c.email}</p>}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{formatPhoneDisplay(c.phone)}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{c.completedOrdersCount} orders</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">₹{c.totalSpent.toFixed(2)}</td>
                      <td className="py-3 px-4 text-slate-600">₹{aov.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={c.segment} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/customers/${c.id}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-indigo-600 font-medium text-[11px] rounded border border-slate-200 transition-colors"
                        >
                          View 360° Profile
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-normal">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Add New Customer</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {addError && <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">{addError}</div>}

            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Phone Number (10 digits) *</label>
                <input
                  type="text"
                  required
                  placeholder="9876543210"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Default Address</label>
                <textarea
                  rows={2}
                  value={addForm.default_address}
                  onChange={(e) => setAddForm({ ...addForm, default_address: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
