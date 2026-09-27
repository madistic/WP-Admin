"use client"

import { useState, useEffect } from "react"

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

export interface IngredientInput {
  inventory_item_id: string
  quantity: string
  unit: string
}

interface InventoryItemOption {
  id: string
  name: string
  unit: string
  quantity: number
  cost_per_unit: number | null
}

interface EditableMenuItem {
  id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  is_available: boolean
  is_active: boolean
  is_veg: boolean
  prep_time_minutes: number | null
  is_today_special: boolean
  special_until_date: string | null
  is_bestseller: boolean
  variants: Array<{ name: string; price: number; is_available: boolean }>
  addons: Array<{ name: string; price: number; is_available: boolean }>
  ingredients?: Array<{
    inventory_item_id: string
    quantity: number
    unit: string
    inventoryItem?: { id: string; name: string; unit: string }
  }>
}

interface MenuItemModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Array<{ id: string; name: string }>
  itemToEdit?: EditableMenuItem | null
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
    itemToEdit?.variants?.map((v) => ({ name: v.name, price: String(v.price), is_available: v.is_available })) || []
  )

  const [addons, setAddons] = useState<AddonInput[]>(
    itemToEdit?.addons?.map((a) => ({ name: a.name, price: String(a.price), is_available: a.is_available })) || []
  )

  const [ingredients, setIngredients] = useState<IngredientInput[]>([])
  const [availableInventory, setAvailableInventory] = useState<InventoryItemOption[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch available inventory items when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingInventory(true)
      fetch("/api/inventory/items")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAvailableInventory(data)
          }
        })
        .catch((err) => console.error("Error fetching inventory items:", err))
        .finally(() => setLoadingInventory(false))
    }
  }, [isOpen])

  // Sync state when itemToEdit changes
  useEffect(() => {
    if (isOpen) {
      setCategoryId(itemToEdit?.category_id || (categories[0]?.id || ""))
      setName(itemToEdit?.name || "")
      setDescription(itemToEdit?.description || "")
      setPrice(itemToEdit?.price ? String(itemToEdit.price) : "")
      setImageUrl(itemToEdit?.image_url || "")
      setIsAvailable(itemToEdit?.is_available ?? true)
      setIsActive(itemToEdit?.is_active ?? true)
      setIsVeg(itemToEdit?.is_veg ?? true)
      setPrepTimeMinutes(itemToEdit?.prep_time_minutes ? String(itemToEdit.prep_time_minutes) : "15")
      setIsTodaySpecial(itemToEdit?.is_today_special ?? false)
      setSpecialUntilDate(itemToEdit?.special_until_date ? new Date(itemToEdit.special_until_date).toISOString().split("T")[0] : "")
      setIsBestseller(itemToEdit?.is_bestseller ?? false)
      setVariants(itemToEdit?.variants?.map((v) => ({ name: v.name, price: String(v.price), is_available: v.is_available })) || [])
      setAddons(itemToEdit?.addons?.map((a) => ({ name: a.name, price: String(a.price), is_available: a.is_available })) || [])
      setError(null)

      if (itemToEdit?.ingredients && itemToEdit.ingredients.length > 0) {
        setIngredients(
          itemToEdit.ingredients.map((ing) => ({
            inventory_item_id: ing.inventory_item_id,
            quantity: String(ing.quantity),
            unit: ing.unit,
          }))
        )
      } else if (itemToEdit?.id) {
        // Fetch full details if not loaded with list
        fetch(`/api/menu/items/${itemToEdit.id}`)
          .then((res) => res.json())
          .then((itemData) => {
            if (itemData?.ingredients && Array.isArray(itemData.ingredients)) {
              setIngredients(
                itemData.ingredients.map((ing: any) => ({
                  inventory_item_id: ing.inventory_item_id,
                  quantity: String(ing.quantity),
                  unit: ing.unit,
                }))
              )
            }
          })
          .catch(console.error)
      } else {
        setIngredients([])
      }
    }
  }, [itemToEdit, isOpen, categories])

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

  function addIngredientRow() {
    const firstItem = availableInventory[0]
    setIngredients([
      ...ingredients,
      {
        inventory_item_id: firstItem ? firstItem.id : "",
        quantity: "",
        unit: firstItem ? firstItem.unit : "g",
      },
    ])
  }

  function updateIngredientRow(index: number, field: keyof IngredientInput, value: string) {
    const next = [...ingredients]
    next[index] = { ...next[index], [field]: value }

    // If changing inventory item, auto-select its native unit if unit is currently empty or matches old unit
    if (field === "inventory_item_id") {
      const selected = availableInventory.find((item) => item.id === value)
      if (selected) {
        next[index].unit = selected.unit
      }
    }

    setIngredients(next)
  }

  function removeIngredientRow(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Validate ingredients
      const validIngredients = ingredients
        .filter((ing) => ing.inventory_item_id.trim())
        .map((ing) => {
          const qty = parseFloat(ing.quantity)
          if (isNaN(qty) || qty <= 0) {
            throw new Error("Each ingredient must have a quantity greater than 0.")
          }
          if (!ing.unit.trim()) {
            throw new Error("Each ingredient must have a specified unit.")
          }
          return {
            inventory_item_id: ing.inventory_item_id,
            quantity: qty,
            unit: ing.unit.trim(),
          }
        })

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
        ingredients: validIngredients,
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
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {itemToEdit ? "Edit Menu Item" : "Add New Menu Item"}
            </h2>
            <p className="text-xs text-gray-500">
              {itemToEdit
                ? "Update menu item details, recipe ingredients, and pricing"
                : "Creates item, syncs with Meta Commerce Catalog, and links inventory"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold p-1">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start space-x-2">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

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

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              placeholder="e.g. Fragrant basmati rice layered with spiced marinated chicken and herbs..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="250"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Prep Time (Mins)</label>
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
              <div className="mt-2 flex items-center space-x-4 text-sm">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={isVeg}
                    onChange={() => setIsVeg(true)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="ml-1.5 text-emerald-700 font-medium">🌱 Veg</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={!isVeg}
                    onChange={() => setIsVeg(false)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span className="ml-1.5 text-rose-700 font-medium">🍗 Non-Veg</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Image URL</label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="inline-flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>In Stock / Available</span>
            </label>

            <label className="inline-flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>Active on Menu</span>
            </label>

            <label className="inline-flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isTodaySpecial}
                onChange={(e) => setIsTodaySpecial(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span>⭐ Today's Special</span>
            </label>

            <label className="inline-flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
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

          {/* ─────────────────────────────────────────────────────────────
              INGREDIENTS & RECIPE (INVENTORY INTEGRATION)
              ───────────────────────────────────────────────────────────── */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <span>🥫</span>
                  <span>Recipe Ingredients (Inventory Deduction)</span>
                </span>
                <p className="text-[11px] text-gray-500">
                  Deducted automatically when WhatsApp orders are accepted or POS orders are completed.
                </p>
              </div>
              <button
                type="button"
                onClick={addIngredientRow}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
              >
                <span>+</span> Add Ingredient
              </button>
            </div>

            {ingredients.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
                <p className="text-xs text-slate-500">
                  No ingredients configured for this item.
                </p>
                <button
                  type="button"
                  onClick={addIngredientRow}
                  className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  + Link inventory item (e.g. Rice, Chicken, Oil)
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {ingredients.map((ing, idx) => {
                  const selectedItem = availableInventory.find((item) => item.id === ing.inventory_item_id)

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      {/* Searchable / Select Inventory Item */}
                      <div className="flex-1">
                        <select
                          required
                          value={ing.inventory_item_id}
                          onChange={(e) => updateIngredientRow(idx, "inventory_item_id", e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Select Inventory Item...</option>
                          {availableInventory.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} (Stock: {inv.quantity} {inv.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity Required */}
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.001"
                          required
                          placeholder="Qty (e.g. 250)"
                          value={ing.quantity}
                          onChange={(e) => updateIngredientRow(idx, "quantity", e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Unit */}
                      <div className="w-24">
                        <input
                          type="text"
                          required
                          placeholder="Unit (g, ml...)"
                          value={ing.unit}
                          onChange={(e) => updateIngredientRow(idx, "unit", e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeIngredientRow(idx)}
                        className="text-slate-400 hover:text-rose-600 font-bold px-1.5 py-1 rounded transition-colors"
                        title="Remove Ingredient"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
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
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>{itemToEdit ? "Saving Changes..." : "Syncing to Meta & Saving..."}</span>
                </>
              ) : (
                <span>{itemToEdit ? "Update Menu Item" : "Create Menu Item"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
