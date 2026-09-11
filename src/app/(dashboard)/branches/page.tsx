"use client"

import { useState, useEffect, useCallback } from "react"

interface Branch {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
  latitude: number | null
  longitude: number | null
  delivery_enabled: boolean
  delivery_free_distance_km: number
  delivery_extra_charge_per_km: number
  delivery_charge_rounding: string
  delivery_max_distance_km: number | null
  is_active: boolean
  created_at: string
  _count?: { orders: number; customers: number }
}

interface BranchFormData {
  name: string
  code: string
  address: string
  phone: string
  email: string
  latitude: string
  longitude: string
  delivery_enabled: boolean
  delivery_free_distance_km: string
  delivery_extra_charge_per_km: string
  delivery_charge_rounding: string
  delivery_max_distance_km: string
  is_active: boolean
}

const emptyForm: BranchFormData = {
  name: "",
  code: "",
  address: "",
  phone: "",
  email: "",
  latitude: "",
  longitude: "",
  delivery_enabled: true,
  delivery_free_distance_km: "1.5",
  delivery_extra_charge_per_km: "10",
  delivery_charge_rounding: "PER_STARTED_KM",
  delivery_max_distance_km: "",
  is_active: true,
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [form, setForm] = useState<BranchFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const loadBranches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/branches")
      const data = await res.json()
      setBranches(data.branches || [])
    } catch {
      setError("Failed to load branches")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBranches() }, [loadBranches])

  function openCreate() {
    setEditBranch(null)
    setForm(emptyForm)
    setError("")
    setShowForm(true)
  }

  function openEdit(branch: Branch) {
    setEditBranch(branch)
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      latitude: branch.latitude?.toString() || "",
      longitude: branch.longitude?.toString() || "",
      delivery_enabled: branch.delivery_enabled,
      delivery_free_distance_km: branch.delivery_free_distance_km.toString(),
      delivery_extra_charge_per_km: branch.delivery_extra_charge_per_km.toString(),
      delivery_charge_rounding: branch.delivery_charge_rounding,
      delivery_max_distance_km: branch.delivery_max_distance_km?.toString() || "",
      is_active: branch.is_active,
    })
    setError("")
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const payload = {
      ...form,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      delivery_free_distance_km: parseFloat(form.delivery_free_distance_km),
      delivery_extra_charge_per_km: parseFloat(form.delivery_extra_charge_per_km),
      delivery_max_distance_km: form.delivery_max_distance_km ? parseFloat(form.delivery_max_distance_km) : null,
    }

    try {
      const url = editBranch ? `/api/branches/${editBranch.id}` : "/api/branches"
      const method = editBranch ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to save branch")
      } else {
        setSuccessMsg(editBranch ? "Branch updated!" : "Branch created!")
        setShowForm(false)
        loadBranches()
        setTimeout(() => setSuccessMsg(""), 3000)
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(branch: Branch) {
    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !branch.is_active }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to update branch status")
      } else {
        loadBranches()
      }
    } catch {
      alert("Network error")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Branch Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage restaurant branches, locations and delivery settings
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <span className="text-lg leading-none">+</span>
          Add Branch
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">
          ✅ {successMsg}
        </div>
      )}

      {/* Branch List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="animate-spin w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full mr-3" />
          Loading branches...
        </div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-slate-600 font-medium">No branches yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first branch to get started</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl"
          >
            Create Branch
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className={`bg-white rounded-2xl border shadow-sm transition-all ${
                branch.is_active ? "border-slate-200" : "border-slate-200 opacity-60"
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900">{branch.name}</h2>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-mono rounded-lg">
                        {branch.code}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          branch.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {branch.is_active ? "● Active" : "○ Inactive"}
                      </span>
                      {!branch.delivery_enabled && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                          Delivery Off
                        </span>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
                      {branch.address && (
                        <div className="flex items-start gap-1.5 col-span-2">
                          <span className="text-slate-400 mt-0.5">📍</span>
                          <span className="text-slate-500">{branch.address}</span>
                        </div>
                      )}
                      {branch.latitude && branch.longitude ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span>🌐</span>
                          <span>{branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500">
                          <span>⚠️</span>
                          <span>Location not set</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>🛵</span>
                        <span>
                          Free {branch.delivery_free_distance_km} km •
                          ₹{branch.delivery_extra_charge_per_km}/km
                          {branch.delivery_max_distance_km ? ` • Max ${branch.delivery_max_distance_km} km` : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(branch)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        branch.is_active
                          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {branch.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openEdit(branch)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-all"
                    >
                      ✏️ Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Branch Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">
                {editBranch ? `Edit: ${editBranch.name}` : "Create New Branch"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Basic Info */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Branch Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Main Branch"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Branch Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. MAIN"
                      required
                      maxLength={10}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Branch address"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
              </div>

              {/* Location Settings */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Branch Location
                </h3>
                <p className="text-xs text-amber-600 mb-3">
                  ⚠️ Latitude & longitude are required for nearest-branch delivery assignment.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      placeholder="e.g. 19.0760"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      placeholder="e.g. 72.8777"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Settings */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Delivery Settings
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setForm({ ...form, delivery_enabled: !form.delivery_enabled })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        form.delivery_enabled ? "bg-indigo-500" : "bg-slate-300"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          form.delivery_enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-700">Delivery Enabled</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Free Delivery Distance (km)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={form.delivery_free_distance_km}
                        onChange={(e) => setForm({ ...form, delivery_free_distance_km: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Extra Charge (₹ per km)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={form.delivery_extra_charge_per_km}
                        onChange={(e) => setForm({ ...form, delivery_extra_charge_per_km: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Max Delivery Distance (km, optional)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={form.delivery_max_distance_km}
                        onChange={(e) => setForm({ ...form, delivery_max_distance_km: e.target.value })}
                        placeholder="No limit"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Charge Rounding
                      </label>
                      <select
                        value={form.delivery_charge_rounding}
                        onChange={(e) => setForm({ ...form, delivery_charge_rounding: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        <option value="PER_STARTED_KM">Per Started KM (e.g. 1.6km → 2km)</option>
                        <option value="PER_FULL_KM">Per Full KM (floor)</option>
                      </select>
                    </div>
                  </div>

                  {/* Delivery pricing preview */}
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
                    <p className="font-semibold text-slate-700 mb-1">📊 Pricing Preview:</p>
                    {[0.5, 1.5, 1.6, 2.0, 2.5, 3.0].map((d) => {
                      const free = parseFloat(form.delivery_free_distance_km) || 0
                      const rate = parseFloat(form.delivery_extra_charge_per_km) || 0
                      const extra = Math.max(d - free, 0)
                      const units = form.delivery_charge_rounding === "PER_FULL_KM"
                        ? Math.floor(extra)
                        : Math.ceil(extra)
                      const charge = units * rate
                      return (
                        <span key={d} className="mr-4">
                          {d}km → ₹{charge}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      form.is_active ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        form.is_active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Branch Active</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-all"
                >
                  {saving ? "Saving..." : editBranch ? "Save Changes" : "Create Branch"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
