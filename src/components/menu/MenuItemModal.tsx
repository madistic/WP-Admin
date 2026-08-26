"use client"

import { useState } from "react"

interface VariantInput {
  name: string
  price: string
  is_available: boolean
}

interface AddonInput {
  name: string
  price: string
  is_available: boolean
}

interface MenuItemModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Array<{ id: string; name: string }>
  itemToEdit?: any | null
}

export default function MenuItemModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
  itemToEdit,
}: MenuItemModalProps) {
  const [categoryId, setCategoryId] = useState(itemToEdit?.category_id || (categories[0]?.id || ""))
  const [name, setName] = useState(itemToEdit?.name || "")
  const [description, setDescription] = useState(itemToEdit?.description || "")
  const [price, setPrice] = useState(itemToEdit?.price ? String(itemToEdit.price) : "")
  const [imageUrl, setImageUrl] = useState(itemToEdit?.image_url || "")
  const [isAvailable, setIsAvailable] = useState(itemToEdit?.is_available ?? true)
  const [isActive, setIsActive] = useState(itemToEdit?.is_active ?? true)
  const [isVeg, setIsVeg] = useState(itemToEdit?.is_veg ?? true)
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(itemToEdit?.prep_time_minutes ? String(itemToEdit.prep_time_minutes) : "15")
  const [isTodaySpecial, setIsTodaySpecial] = useState(itemToEdit?.is_today_special ?? false)
  const [specialUntilDate, setSpecialUntilDate] = useState(
    itemToEdit?.special_until_date ? new Date(itemToEdit.special_until_date).toISOString().split("T")[0] : ""
  )
  const [isBestseller, setIsBestseller] = useState(itemToEdit?.is_bestseller ?? false)

  const [variants, setVariants] = useState<VariantInput[]>(
    itemToEdit?.variants?.map((v: any) => ({ name: v.name, price: String(v.price), is_available: v.is_available })) || []
  )

  const [addons, setAddons] = useState<AddonInput[]>(
    itemToEdit?.addons?.map((a: any) => ({ name: a.name, price: String(a.price), is_available: a.is_available })) || []
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  function addVariantRow() {
    setVariants([...variants, { name: "", price: "", is_available: true }])
  }

  function removeVariantRow(index: number) {
    setVariants(variants.filter((_, i) => i !== index))
  }

  function addAddonRow() {
    setAddons([...addons, { name: "", price: "", is_available: true }])
  }

  function removeAddonRow(index: number) {
    setAddons(addons.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        category_id: categoryId,
        name,
        description,
        price,
        image_url: imageUrl,
        is_available: isAvailable,
        is_active: isActive,
        is_veg: isVeg,
        prep_time_minutes: prepTimeMinutes,
        is_today_special: isTodaySpecial,
        special_until_date: isTodaySpecial && specialUntilDate ? specialUntilDate : null,
        is_bestseller: isBestseller,
        variants: variants.filter((v) => v.name.trim() && v.price),
        addons: addons.filter((a) => a.name.trim() && a.price),
      }

      const url = itemToEdit ? `/api/menu/items/${itemToEdit.id}` : "/api/menu/items"
      const method = itemToEdit ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save item")

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b pb-3 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">
            {itemToEdit ? "Edit Menu Item" : "Add New Menu Item"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">
            ✕
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Category *</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Item Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Chicken Dum Biryani"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="220"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Prep Time (mins)</label>
              <input
                type="number"
                placeholder="15"
                value={prepTimeMinutes}
                onChange={(e) => setPrepTimeMinutes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Dietary Type</label>
              <select
                value={isVeg ? "veg" : "non-veg"}
                onChange={(e) => setIsVeg(e.target.value === "veg")}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="veg">🟢 Veg</option>
                <option value="non-veg">🔴 Non-Veg</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Image URL (Optional)</label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              placeholder="Detailed description of ingredients, spices, portion size..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Status & Attributes Switches */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-gray-50 rounded-lg border">
            <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>In Stock</span>
            </label>

            <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>Active Item</span>
            </label>

            <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isTodaySpecial}
                onChange={(e) => setIsTodaySpecial(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>⭐ Special</span>
            </label>

            <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isBestseller}
                onChange={(e) => setIsBestseller(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>🔥 Bestseller</span>
            </label>
          </div>

          {isTodaySpecial && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <label className="block text-xs font-semibold text-amber-900 mb-1">
                Special Expiration Date (Optional — auto resets after date)
              </label>
              <input
                type="date"
                value={specialUntilDate}
                onChange={(e) => setSpecialUntilDate(e.target.value)}
                className="block w-full rounded-md border border-amber-300 px-3 py-1.5 text-xs bg-white focus:outline-none"
              />
            </div>
          )}

          {/* Rule 8: Variants Builder */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-900">Item Variants (Optional)</span>
              <button
                type="button"
                onClick={addVariantRow}
                className="text-xs text-indigo-600 font-semibold hover:underline"
              >
                + Add Variant (e.g., Half/Full)
              </button>
            </div>
            {variants.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No variants added (Standard single price item).</p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Variant Name (e.g. Half)"
                      value={v.name}
                      onChange={(e) => {
                        const next = [...variants]
                        next[idx].name = e.target.value
                        setVariants(next)
                      }}
                      className="flex-1 rounded-md border px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Price ₹"
                      value={v.price}
                      onChange={(e) => {
                        const next = [...variants]
                        next[idx].price = e.target.value
                        setVariants(next)
                      }}
                      className="w-24 rounded-md border px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariantRow(idx)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add-ons Builder */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-900">Add-ons / Modifiers (Optional)</span>
              <button
                type="button"
                onClick={addAddonRow}
                className="text-xs text-indigo-600 font-semibold hover:underline"
              >
                + Add Add-on (e.g., Extra Cheese)
              </button>
            </div>
            {addons.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No add-ons added.</p>
            ) : (
              <div className="space-y-2">
                {addons.map((a, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Add-on Name (e.g. Extra Cheese)"
                      value={a.name}
                      onChange={(e) => {
                        const next = [...addons]
                        next[idx].name = e.target.value
                        setAddons(next)
                      }}
                      className="flex-1 rounded-md border px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Price ₹"
                      value={a.price}
                      onChange={(e) => {
                        const next = [...addons]
                        next[idx].price = e.target.value
                        setAddons(next)
                      }}
                      className="w-24 rounded-md border px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeAddonRow(idx)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t sticky bottom-0 bg-white">
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
              {loading ? "Saving..." : itemToEdit ? "Update Menu Item" : "Create Menu Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
