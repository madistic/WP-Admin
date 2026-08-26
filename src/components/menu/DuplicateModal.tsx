"use client"

import { useState } from "react"

interface DuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  itemToDuplicate: {
    id: string
    name: string
    price: number
  } | null
}

export default function DuplicateModal({
  isOpen,
  onClose,
  onSuccess,
  itemToDuplicate,
}: DuplicateModalProps) {
  const [newName, setNewName] = useState(itemToDuplicate ? `${itemToDuplicate.name} Special` : "")
  const [newPrice, setNewPrice] = useState(itemToDuplicate ? String(itemToDuplicate.price) : "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !itemToDuplicate) return null

  const targetItem = itemToDuplicate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/menu/items/${targetItem.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_name: newName,
          new_price: newPrice,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to duplicate item")

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">Duplicate Menu Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Cloning item: <span className="font-semibold text-gray-900">{itemToDuplicate?.name || ""}</span>. Confirm the new name and price below:
        </p>

        {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">New Item Name *</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">New Price (₹) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
            >
              {loading ? "Duplicating..." : "Confirm & Create Duplicate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
