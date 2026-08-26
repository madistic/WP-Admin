"use client"

import { useState, useEffect } from "react"

interface Restaurant {
  id: string
  name: string
  is_open: boolean
  minimum_order: number
  delivery_fee: number
  phone: string | null
  address: string | null
}

export default function SettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      const res = await fetch("/api/restaurant")
      if (res.ok) {
        const data = await res.json()
        setRestaurant(data)
      }
    } catch (err) {
      console.error("Failed to load restaurant settings", err)
    } finally {
      setLoading(false)
    }
  }

  async function updateStoreStatus(isOpen: boolean) {
    if (!restaurant) return
    setSaving(true)
    try {
      const res = await fetch("/api/restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_open: isOpen }),
      })
      if (res.ok) {
        setRestaurant({ ...restaurant, is_open: isOpen })
        setMessage(`Store is now ${isOpen ? 'OPEN & accepting orders' : 'CLOSED'}`)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!restaurant) return
    setSaving(true)
    setMessage(null)

    const formData = new FormData(e.currentTarget)
    const minimum_order = formData.get("minimum_order")
    const delivery_fee = formData.get("delivery_fee")

    try {
      const res = await fetch("/api/restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minimum_order: Number(minimum_order),
          delivery_fee: Number(delivery_fee),
        }),
      })

      if (res.ok) {
        setMessage("Restaurant settings updated successfully!")
        fetchSettings()
      }
    } catch (err) {
      console.error("Failed to save settings", err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading restaurant configuration...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Restaurant Settings</h1>
        <p className="text-slate-500 text-xs font-normal mt-0.5">
          Control online ordering acceptance, minimum order thresholds, and delivery pricing.
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
          {message}
        </div>
      )}

      {/* Store Status Acceptance Switch */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">Online Store Acceptance</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Ordering Availability Status</p>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Turn off to temporarily stop receiving new WhatsApp orders.
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => updateStoreStatus(!restaurant?.is_open)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-xs ${
              restaurant?.is_open
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"
            }`}
          >
            {restaurant?.is_open ? "🟢 Open for Orders" : "🔴 Store Closed"}
          </button>
        </div>
      </div>

      {/* Delivery & Pricing Settings */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">Pricing & Delivery Thresholds</h2>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-normal">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Minimum Order Amount (₹)</label>
              <input
                type="number"
                name="minimum_order"
                defaultValue={restaurant?.minimum_order || 0}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Orders below this amount will be rejected.</p>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Flat Delivery Fee (₹)</label>
              <input
                type="number"
                name="delivery_fee"
                defaultValue={restaurant?.delivery_fee || 0}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Standard delivery charge applied to every order.</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs disabled:opacity-50"
            >
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
