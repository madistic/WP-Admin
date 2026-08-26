"use client"

import { useState, useEffect } from "react"
import CategoryModal from "@/components/menu/CategoryModal"
import MenuItemModal from "@/components/menu/MenuItemModal"
import DuplicateModal from "@/components/menu/DuplicateModal"

interface MenuItem {
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
  sort_order: number
  category: { id: string; name: string; is_active: boolean }
  variants: Array<{ id: string; name: string; price: number; is_available: boolean }>
  addons: Array<{ id: string; name: string; price: number; is_available: boolean }>
}

interface Category {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  _count?: { items: number }
}

interface Stats {
  totalCategories: number
  totalItems: number
  activeItems: number
  inactiveItems: number
  todaySpecials: number
  outOfStockItems: number
}

export default function MenuManagementView() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [stats, setStats] = useState<Stats>({
    totalCategories: 0,
    totalItems: 0,
    activeItems: 0,
    inactiveItems: 0,
    todaySpecials: 0,
    outOfStockItems: 0,
  })
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [activeFilterTab, setActiveFilterTab] = useState<string>("ALL") // ALL, SPECIALS, BESTSELLERS, AVAILABLE, OUT_OF_STOCK, INACTIVE

  // Selection for Bulk Actions
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null)

  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null)

  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false)
  const [itemToDuplicate, setItemToDuplicate] = useState<MenuItem | null>(null)

  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    fetchMenuData()
  }, [])

  async function fetchMenuData() {
    try {
      setLoading(true)
      const res = await fetch("/api/menu")
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories || [])
        setItems(data.items || [])
        setStats(data.stats || {})
      }
    } catch (err) {
      console.error("Failed to fetch menu data", err)
    } finally {
      setLoading(false)
    }
  }

  // Quick Toggles
  async function toggleItemProperty(itemId: string, property: string, currentValue: boolean) {
    setTogglingId(itemId)
    try {
      const res = await fetch(`/api/menu/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [property]: !currentValue }),
      })
      if (res.ok) {
        await fetchMenuData()
      }
    } catch (err) {
      console.error("Toggle error", err)
    } finally {
      setTogglingId(null)
    }
  }

  // Quick Category Active Toggle
  async function toggleCategoryActive(cat: Category) {
    try {
      const res = await fetch("/api/menu/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cat.id, is_active: !cat.is_active }),
      })
      if (res.ok) fetchMenuData()
    } catch (err) {
      console.error("Category toggle error", err)
    }
  }

  // Delete Category with warning check
  async function handleDeleteCategory(cat: Category) {
    if (cat._count && cat._count.items > 0) {
      const confirmForce = window.confirm(
        `Warning: Category "${cat.name}" contains ${cat._count.items} menu item(s).\n\nDeleting this category will permanently delete all menu items inside it. Are you sure you want to delete everything?`
      )
      if (!confirmForce) return

      await deleteCategory(cat.id, true)
    } else {
      if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return
      await deleteCategory(cat.id, false)
    }
  }

  async function deleteCategory(id: string, force: boolean) {
    try {
      const res = await fetch(`/api/menu/categories?id=${id}${force ? "&force=true" : ""}`, {
        method: "DELETE",
      })
      if (res.ok) fetchMenuData()
      else {
        const data = await res.json()
        alert(data.error || "Failed to delete category")
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Delete Menu Item
  async function handleDeleteItem(item: MenuItem) {
    if (!window.confirm(`Delete menu item "${item.name}"? This action cannot be undone.`)) return
    try {
      const res = await fetch(`/api/menu/items/${item.id}`, { method: "DELETE" })
      if (res.ok) fetchMenuData()
    } catch (err) {
      console.error(err)
    }
  }

  // Bulk Actions
  async function handleBulkAction(action: string) {
    if (selectedItemIds.length === 0) return
    if (action === "delete" && !window.confirm(`Delete ${selectedItemIds.length} selected item(s)?`)) return

    try {
      const res = await fetch("/api/menu/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, item_ids: selectedItemIds }),
      })
      if (res.ok) {
        setSelectedItemIds([])
        fetchMenuData()
      }
    } catch (err) {
      console.error("Bulk action error", err)
    }
  }

  // Checkbox Selection
  function toggleSelectItem(id: string) {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  function toggleSelectAll(filteredItems: MenuItem[]) {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([])
    } else {
      setSelectedItemIds(filteredItems.map((i) => i.id))
    }
  }

  // Category & Item Reordering
  async function moveCategoryOrder(index: number, direction: "up" | "down") {
    const nextCategories = [...categories]
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= nextCategories.length) return

    const temp = nextCategories[index]
    nextCategories[index] = nextCategories[targetIdx]
    nextCategories[targetIdx] = temp
    setCategories(nextCategories)

    try {
      await fetch("/api/menu/categories/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: nextCategories.map((c) => c.id) }),
      })
    } catch (err) {
      console.error("Reorder failed", err)
    }
  }

  async function moveItemOrder(itemIndex: number, direction: "up" | "down", currentFiltered: MenuItem[]) {
    const nextFiltered = [...currentFiltered]
    const targetIdx = direction === "up" ? itemIndex - 1 : itemIndex + 1
    if (targetIdx < 0 || targetIdx >= nextFiltered.length) return

    const temp = nextFiltered[itemIndex]
    nextFiltered[itemIndex] = nextFiltered[targetIdx]
    nextFiltered[targetIdx] = temp

    try {
      await fetch("/api/menu/items/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: nextFiltered.map((i) => i.id) }),
      })
      fetchMenuData()
    } catch (err) {
      console.error("Reorder items failed", err)
    }
  }

  // Filtered List Computation
  const filteredItems = items.filter((item) => {
    // 1. Search Query
    const matchesSearch =
      search.trim() === "" ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()))

    if (!matchesSearch) return false

    // 2. Category Select
    if (selectedCategory !== "ALL" && item.category_id !== selectedCategory) {
      return false
    }

    // 3. Tab Filter
    if (activeFilterTab === "SPECIALS") return item.is_today_special
    if (activeFilterTab === "BESTSELLERS") return item.is_bestseller
    if (activeFilterTab === "AVAILABLE") return item.is_available
    if (activeFilterTab === "OUT_OF_STOCK") return !item.is_available
    if (activeFilterTab === "INACTIVE") return !item.is_active || !item.category.is_active

    return true
  })

  if (loading && items.length === 0) {
    return <div className="p-12 text-center text-gray-500 font-medium">Loading POS Menu Module...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Overview KPIs Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Menu Catalog Management</h1>
          <p className="text-slate-500 text-xs font-normal mt-0.5">
            Manage categories, menu item pricing, stock availability, today's specials, and item variants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCategoryToEdit(null)
              setIsCategoryModalOpen(true)
            }}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-xs hover:bg-slate-50 transition-colors"
          >
            + Add Category
          </button>
          <button
            onClick={() => {
              setItemToEdit(null)
              setIsItemModalOpen(true)
            }}
            className="px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg shadow-xs hover:bg-indigo-700 transition-colors"
          >
            + Add Menu Item
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-200">
          <p className="text-xs font-medium text-slate-500">Total Categories</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{stats.totalCategories || 0}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-200">
          <p className="text-xs font-medium text-slate-500">Total Menu Items</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{stats.totalItems || 0}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-emerald-200 bg-emerald-50/30">
          <p className="text-xs font-medium text-emerald-800">Active Items</p>
          <p className="text-xl font-semibold text-emerald-900 mt-1">{stats.activeItems || 0}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-200">
          <p className="text-xs font-medium text-slate-500">Inactive Items</p>
          <p className="text-xl font-semibold text-slate-700 mt-1">{stats.inactiveItems || 0}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-amber-200 bg-amber-50/30">
          <p className="text-xs font-medium text-amber-800">⭐ Today's Specials</p>
          <p className="text-xl font-semibold text-amber-900 mt-1">{stats.todaySpecials || 0}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-rose-200 bg-rose-50/30">
          <p className="text-xs font-medium text-rose-800">Out of Stock</p>
          <p className="text-xl font-semibold text-rose-900 mt-1">{stats.outOfStockItems || 0}</p>
        </div>
      </div>

      {/* 2. Categories Management Drawer / Pill List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>📁 Menu Categories & Display Order</span>
            <span className="text-xs font-normal text-gray-500">(Drag or use arrows to reorder)</span>
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === "ALL"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All Categories ({items.length})
          </button>

          {categories.map((cat, idx) => (
            <div
              key={cat.id}
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg border text-xs font-medium transition ${
                selectedCategory === cat.id ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "bg-gray-50 text-gray-800"
              }`}
            >
              <button onClick={() => setSelectedCategory(cat.id)} className="font-semibold">
                {cat.name} {!cat.is_active && <span className="text-red-500">(Inactive)</span>}
              </button>
              <span className="text-[10px] text-gray-400 font-mono">({cat._count?.items || 0})</span>

              {/* Reorder Arrows */}
              <div className="flex items-center space-x-0.5 ml-1 pl-1 border-l">
                <button
                  disabled={idx === 0}
                  onClick={() => moveCategoryOrder(idx, "up")}
                  className="hover:text-indigo-600 disabled:opacity-30 text-[10px]"
                  title="Move category left"
                >
                  ◀
                </button>
                <button
                  disabled={idx === categories.length - 1}
                  onClick={() => moveCategoryOrder(idx, "down")}
                  className="hover:text-indigo-600 disabled:opacity-30 text-[10px]"
                  title="Move category right"
                >
                  ▶
                </button>
              </div>

              {/* Category Quick Actions */}
              <button
                onClick={() => toggleCategoryActive(cat)}
                className={`ml-1 text-[10px] font-bold ${cat.is_active ? "text-green-600" : "text-gray-400"}`}
                title="Toggle Category Active/Inactive"
              >
                ●
              </button>
              <button
                onClick={() => {
                  setCategoryToEdit(cat)
                  setIsCategoryModalOpen(true)
                }}
                className="text-gray-400 hover:text-indigo-600 text-[11px]"
                title="Edit Category"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDeleteCategory(cat)}
                className="text-gray-400 hover:text-red-600 text-[11px]"
                title="Delete Category"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Search Box */}
          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              placeholder="Search items, category, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
            {[
              { id: "ALL", label: "All Items" },
              { id: "SPECIALS", label: "⭐ Specials" },
              { id: "BESTSELLERS", label: "🔥 Bestsellers" },
              { id: "AVAILABLE", label: "🟢 Available" },
              { id: "OUT_OF_STOCK", label: "🔴 Out of Stock" },
              { id: "INACTIVE", label: "⚪ Inactive" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeFilterTab === tab.id
                    ? "bg-white text-gray-900 font-bold shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Bulk Actions Header Bar */}
        {selectedItemIds.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg flex items-center justify-between text-xs">
            <span className="font-semibold text-indigo-900">
              {selectedItemIds.length} item(s) selected
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction("mark_available")}
                className="px-2.5 py-1 bg-white border border-indigo-300 text-indigo-700 font-medium rounded hover:bg-indigo-100"
              >
                Mark Available
              </button>
              <button
                onClick={() => handleBulkAction("mark_out_of_stock")}
                className="px-2.5 py-1 bg-white border border-indigo-300 text-indigo-700 font-medium rounded hover:bg-indigo-100"
              >
                Mark Out of Stock
              </button>
              <button
                onClick={() => handleBulkAction("activate")}
                className="px-2.5 py-1 bg-white border border-indigo-300 text-indigo-700 font-medium rounded hover:bg-indigo-100"
              >
                Activate
              </button>
              <button
                onClick={() => handleBulkAction("deactivate")}
                className="px-2.5 py-1 bg-white border border-indigo-300 text-indigo-700 font-medium rounded hover:bg-indigo-100"
              >
                Deactivate
              </button>
              <button
                onClick={() => handleBulkAction("delete")}
                className="px-2.5 py-1 bg-red-600 text-white font-medium rounded hover:bg-red-700"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Menu Items POS Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg font-bold text-gray-700">No menu items found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting search filters or add a new menu item.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.length === filteredItems.length && filteredItems.length > 0}
                      onChange={() => toggleSelectAll(filteredItems)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                  </th>
                  <th className="py-3 px-4">Item Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Stock Availability</th>
                  <th className="py-3 px-4">Today's Special</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredItems.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                      />
                    </td>

                    {/* Item Details */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg">
                            🍽️
                          </div>
                        )}
                        <div>
                          <div className="flex items-center space-x-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${item.is_veg ? "bg-green-500" : "bg-red-500"}`}
                              title={item.is_veg ? "Vegetarian" : "Non-Vegetarian"}
                            />
                            <span className="font-bold text-gray-900">{item.name}</span>
                            {item.is_bestseller && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-bold rounded">
                                🔥 Bestseller
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{item.description}</p>
                          )}
                          {item.prep_time_minutes && (
                            <span className="text-[10px] text-gray-400">⏱️ {item.prep_time_minutes} mins prep</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md">
                        {item.category.name}
                      </span>
                    </td>

                    {/* Price & Variants */}
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      ₹{item.price.toFixed(2)}
                      {item.variants && item.variants.length > 0 && (
                        <div className="text-[10px] text-indigo-600 font-normal mt-0.5">
                          {item.variants.length} variant(s)
                        </div>
                      )}
                    </td>

                    {/* Quick Availability Toggle (Rule 4, 6) */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleItemProperty(item.id, "is_available", item.is_available)}
                        disabled={togglingId === item.id}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                          item.is_available
                            ? "bg-green-100 text-green-800 hover:bg-green-200"
                            : "bg-red-100 text-red-800 hover:bg-red-200"
                        }`}
                      >
                        {item.is_available ? "🟢 Available" : "🔴 Out of Stock"}
                      </button>
                    </td>

                    {/* Quick Today's Special Toggle (Rule 5) */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleItemProperty(item.id, "is_today_special", item.is_today_special)}
                        disabled={togglingId === item.id}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                          item.is_today_special
                            ? "bg-amber-100 border-amber-300 text-amber-900 font-bold"
                            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {item.is_today_special ? "⭐ Special" : "+ Mark Special"}
                      </button>
                    </td>

                    {/* Active / Inactive Status Toggle (Rule 4) */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleItemProperty(item.id, "is_active", item.is_active)}
                        disabled={togglingId === item.id}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          item.is_active && item.category.is_active
                            ? "text-blue-700 bg-blue-50"
                            : "text-gray-500 bg-gray-100"
                        }`}
                      >
                        {item.is_active && item.category.is_active ? "Active ●" : "Inactive ○"}
                      </button>
                    </td>

                    {/* Action Dropdown / Buttons */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Move item sorting */}
                        <button
                          disabled={idx === 0}
                          onClick={() => moveItemOrder(idx, "up", filteredItems)}
                          className="text-gray-400 hover:text-indigo-600 disabled:opacity-20 text-xs"
                          title="Move item up"
                        >
                          ▲
                        </button>
                        <button
                          disabled={idx === filteredItems.length - 1}
                          onClick={() => moveItemOrder(idx, "down", filteredItems)}
                          className="text-gray-400 hover:text-indigo-600 disabled:opacity-20 text-xs"
                          title="Move item down"
                        >
                          ▼
                        </button>

                        <button
                          onClick={() => {
                            setItemToDuplicate(item)
                            setIsDuplicateModalOpen(true)
                          }}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded"
                          title="Duplicate item"
                        >
                          📋 Duplicate
                        </button>

                        <button
                          onClick={() => {
                            setItemToEdit(item)
                            setIsItemModalOpen(true)
                          }}
                          className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs px-1"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="text-red-600 hover:text-red-900 font-semibold text-xs px-1"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={fetchMenuData}
        categoryToEdit={categoryToEdit}
      />

      <MenuItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSuccess={fetchMenuData}
        categories={categories}
        itemToEdit={itemToEdit}
      />

      <DuplicateModal
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        onSuccess={fetchMenuData}
        itemToDuplicate={itemToDuplicate}
      />
    </div>
  )
}
