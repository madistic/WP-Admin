"use client"

import { useState, useEffect } from "react"

interface Restaurant {
  id: string
  loyalty_enabled: boolean
  loyalty_points_value_inr: number
  loyalty_amount_for_one_point: number
  loyalty_min_order_value: number
  loyalty_max_redemption_percent: number
}

export default function LoyaltySettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!restaurant) return
    setSaving(true)
    setMessage(null)
    setError(null)

    const formData = new FormData(e.currentTarget)
    
    try {
      const res = await fetch("/api/restaurant/loyalty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loyalty_enabled: formData.get("loyalty_enabled") === "true",
          loyalty_points_value_inr: Number(formData.get("loyalty_points_value_inr")),
          loyalty_amount_for_one_point: Number(formData.get("loyalty_amount_for_one_point")),
          loyalty_min_order_value: Number(formData.get("loyalty_min_order_value")),
          loyalty_max_redemption_percent: Number(formData.get("loyalty_max_redemption_percent")),
        }),
      })

      if (res.ok) {
        setMessage("Loyalty settings saved successfully!")
        fetchSettings()
      } else {
        const data = await res.json()
        setError(data.error || "Failed to save settings")
      }
    } catch (err: any) {
      console.error("Failed to save settings", err)
      setError("An unexpected error occurred.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading loyalty settings...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Redeem & Loyalty Points</h1>
        <p className="text-slate-500 text-xs font-normal mt-0.5">
          Configure how customers earn and redeem points through WhatsApp orders.
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
          {message}
        </div>
      )}
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <form onSubmit={handleSubmit} className="space-y-6 text-xs font-normal">
          
          <div className="pb-4 border-b border-slate-100">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                name="loyalty_enabled"
                value="true"
                defaultChecked={restaurant?.loyalty_enabled}
                className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-semibold text-slate-900">Enable Redeem System</span>
            </label>
            <p className="text-[11px] text-slate-500 mt-1 ml-8">
              If disabled, customers cannot earn or redeem points, but their existing balance is preserved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Point Value (₹)</label>
              <input
                type="number"
                step="0.01"
                name="loyalty_points_value_inr"
                defaultValue={restaurant?.loyalty_points_value_inr || 1}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
                required
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Example: 1 = 1 point is worth ₹1 discount.</p>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Amount to Earn 1 Point (₹)</label>
              <input
                type="number"
                step="0.01"
                name="loyalty_amount_for_one_point"
                defaultValue={restaurant?.loyalty_amount_for_one_point || 100}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
                required
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Customer earns 1 point for every ₹X spent (excluding delivery/fees).</p>
            </div>
            
            <div>
              <label className="block text-slate-700 font-medium mb-1">Minimum Order Value to Redeem (₹)</label>
              <input
                type="number"
                name="loyalty_min_order_value"
                defaultValue={restaurant?.loyalty_min_order_value || 500}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
                required
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Points can only be redeemed if subtotal is above this.</p>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Max Redemption Percentage (%)</label>
              <input
                type="number"
                name="loyalty_max_redemption_percent"
                min="0"
                max="100"
                defaultValue={restaurant?.loyalty_max_redemption_percent || 50}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
                required
              />
              <p className="text-[11px] text-slate-400 font-normal mt-1">Maximum % of the order value that can be paid using points.</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
