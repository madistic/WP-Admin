"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface InventoryItem {
  id: string
  restaurant_id: string
  branch_id: string | null
  branch?: { id: string; name: string; code: string } | null
  name: string
  quantity: number
  unit: string
  opening_stock: number
  minimum_stock: number
  reorder_level: number
  cost_per_unit: number | null
  total_value: number | null
  is_active: boolean
  is_low_stock: boolean
  is_out_of_stock: boolean
  linked_recipes_count: number
  transactions_count: number
  created_at: string
  updated_at: string
}

interface InventoryTransaction {
  id: string
  inventory_item_id: string
  inventory_item_name: string
  inventory_item_unit: string
  order_id: string | null
  order_number: string | null
  order_source: string | null
  type: "OPENING" | "PURCHASE" | "ADJUSTMENT" | "WASTAGE" | "ORDER_DEDUCTION" | "REVERSAL"
  quantity: number
  previous_quantity: number | null
  new_quantity: number | null
  unit_cost: number | null
  total_cost: number | null
  reason: string | null
  created_by: string | null
  created_at: string
}

interface UnitGroup {
  group: string
  units: { value: string; label: string; hint?: string }[]
}

const INVENTORY_UNIT_GROUPS: UnitGroup[] = [
  {
    group: "Weight",
    units: [
      { value: "kg", label: "Kilogram (kg)", hint: "Rice, Flour, Meat, Vegetables" },
      { value: "g", label: "Gram (g)", hint: "Spices, Salt, Butter, Tea" },
      { value: "mg", label: "Milligram (mg)", hint: "Saffron, Food Color" },
    ],
  },
  {
    group: "Volume / Liquid",
    units: [
      { value: "L", label: "Litre (L)", hint: "Cooking Oil, Milk, Syrups" },
      { value: "ml", label: "Millilitre (ml)", hint: "Essences, Sauces, Cream" },
    ],
  },
  {
    group: "Count & Packaging",
    units: [
      { value: "piece", label: "Piece (pc)", hint: "Eggs, Buns, Patties, Lemons" },
      { value: "packet", label: "Packet (pkt)", hint: "Bread, Seasoning packets" },
      { value: "box", label: "Box", hint: "Pastry boxes, Pre-mixes" },
      { value: "bottle", label: "Bottle", hint: "Sauces, Soft drinks, Syrups" },
      { value: "dozen", label: "Dozen (12 pcs)", hint: "Eggs, Bananas" },
      { value: "can", label: "Can / Tin", hint: "Condensed milk, Tomatoes" },
      { value: "portion", label: "Portion", hint: "Portioned dough, Patties" },
    ],
  },
]

const ALL_STANDARD_UNITS = INVENTORY_UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.value))

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"items" | "ledger">("items")
  const [items, setItems] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "low_stock" | "out_of_stock" | "inactive">("all")
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>("ALL")

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null)
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false)
  const [selectedItemForTx, setSelectedItemForTx] = useState<InventoryItem | null>(null)
  const [historyDrawerItem, setHistoryDrawerItem] = useState<InventoryItem | null>(null)

  // Item form state
  const [itemName, setItemName] = useState("")
  const [itemUnit, setItemUnit] = useState("kg")
  const [customUnit, setCustomUnit] = useState("")
  const [itemOpeningStock, setItemOpeningStock] = useState("0")
  const [itemMinStock, setItemMinStock] = useState("5")
  const [itemReorderLevel, setItemReorderLevel] = useState("10")
  const [itemCostPerUnit, setItemCostPerUnit] = useState("")
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const displayUnit = itemUnit === "custom" ? (customUnit.trim() || "unit") : itemUnit

  // Transaction form state
  const [txType, setTxType] = useState<"PURCHASE" | "ADJUSTMENT" | "WASTAGE">("PURCHASE")
  const [txQuantity, setTxQuantity] = useState("")
  const [txUnitCost, setTxUnitCost] = useState("")
  const [txReason, setTxReason] = useState("")

  const fetchItems = async () => {
    try {
      setLoading(true)
      let url = `/api/inventory/items?filter=${statusFilter}`
      if (search) url += `&search=${encodeURIComponent(search)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setItems(data)
      }
    } catch (err) {
      console.error("Failed to load inventory items:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactions = async () => {
    try {
      let url = "/api/inventory/transactions?limit=100"
      if (ledgerTypeFilter !== "ALL") {
        url += `&type=${ledgerTypeFilter}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data)
      }
    } catch (err) {
      console.error("Failed to load transactions:", err)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [search, statusFilter])

  useEffect(() => {
    if (activeTab === "ledger") {
      fetchTransactions()
    }
  }, [activeTab, ledgerTypeFilter])

  // Summary Metrics
  const totalItemsCount = items.length
  const lowStockCount = items.filter((i) => i.is_low_stock).length
  const outOfStockCount = items.filter((i) => i.is_out_of_stock).length
  const totalValuation = items.reduce((sum, item) => sum + (item.total_value || 0), 0)

  // Open Add Item Modal
  const openAddItemModal = () => {
    setItemToEdit(null)
    setItemName("")
    setItemUnit("kg")
    setCustomUnit("")
    setItemOpeningStock("0")
    setItemMinStock("5")
    setItemReorderLevel("10")
    setItemCostPerUnit("")
    setFormError(null)
    setIsItemModalOpen(true)
  }

  // Open Edit Item Modal
  const openEditItemModal = (item: InventoryItem) => {
    setItemToEdit(item)
    setItemName(item.name)
    if (ALL_STANDARD_UNITS.includes(item.unit)) {
      setItemUnit(item.unit)
      setCustomUnit("")
    } else {
      setItemUnit("custom")
      setCustomUnit(item.unit)
    }
    setItemOpeningStock(String(item.opening_stock))
    setItemMinStock(String(item.minimum_stock))
    setItemReorderLevel(String(item.reorder_level))
    setItemCostPerUnit(item.cost_per_unit ? String(item.cost_per_unit) : "")
    setFormError(null)
    setIsItemModalOpen(true)
  }

  // Open Quick Transaction Modal
  const openTransactionModal = (item?: InventoryItem) => {
    setSelectedItemForTx(item || items[0] || null)
    setTxType("PURCHASE")
    setTxQuantity("")
    setTxUnitCost(item?.cost_per_unit ? String(item.cost_per_unit) : "")
    setTxReason("")
    setFormError(null)
    setIsTransactionModalOpen(true)
  }

  // Handle Save Item (Create or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormLoading(true)
    setFormError(null)

    const finalUnit = itemUnit === "custom" ? customUnit.trim() : itemUnit
    if (!finalUnit) {
      setFormError("Please specify a unit.")
      setFormLoading(false)
      return
    }

    try {
      const payload: any = {
        name: itemName.trim(),
        unit: finalUnit,
        minimum_stock: itemMinStock,
        reorder_level: itemReorderLevel,
        cost_per_unit: itemCostPerUnit ? parseFloat(itemCostPerUnit) : null,
      }

      if (!itemToEdit) {
        payload.quantity = itemOpeningStock
        payload.opening_stock = itemOpeningStock
      }

      const url = itemToEdit ? `/api/inventory/items/${itemToEdit.id}` : "/api/inventory/items"
      const method = itemToEdit ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save inventory item")

      setIsItemModalOpen(false)
      fetchItems()
      if (activeTab === "ledger") fetchTransactions()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setFormLoading(false)
    }
  }

  // Handle Save Transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItemForTx) {
      setFormError("Please select an inventory item.")
      return
    }

    setFormLoading(true)
    setFormError(null)

    try {
      const payload = {
        inventory_item_id: selectedItemForTx.id,
        type: txType,
        quantity: parseFloat(txQuantity),
        unit_cost: txUnitCost ? parseFloat(txUnitCost) : null,
        reason: txReason.trim() || undefined,
      }

      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to record transaction")

      setIsTransactionModalOpen(false)
      fetchItems()
      if (activeTab === "ledger") fetchTransactions()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <span>📦</span>
            <span>Inventory & Stock Management</span>
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Real-time ingredient tracking, automated recipe deductions, purchase & wastage ledger, and low-stock alerts.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>View Analytics</span>
          </Link>
          <button
            onClick={() => openTransactionModal()}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>Record Stock In/Out</span>
          </button>
          <button
            onClick={openAddItemModal}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Add Inventory Item</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Total Tracked Items</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-slate-900">{totalItemsCount}</h3>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Ingredients
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Linked to menu recipes</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Estimated Stock Valuation</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-emerald-700">₹{Math.round(totalValuation).toLocaleString()}</h3>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Live Value
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Sum of (quantity × cost per unit)</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Low Stock Warnings</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-amber-600">{lowStockCount}</h3>
            <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
              At Reorder Level
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Quantity ≤ minimum threshold</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Out of Stock</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-rose-600">{outOfStockCount}</h3>
            <span className="text-xs font-medium text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full">
              Critical
            </span>
          </div>
          <p className="text-[11px] text-slate-400">May block order acceptance</p>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("items")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "items"
              ? "text-indigo-600 font-semibold border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Stock Items ({items.length})
        </button>
        <button
          onClick={() => setActiveTab("ledger")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "ledger"
              ? "text-indigo-600 font-semibold border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Transaction Ledger & History
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: STOCK ITEMS TABLE
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "items" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search inventory items by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-indigo-500 text-slate-800"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
              {[
                { id: "all", label: "All Items" },
                { id: "low_stock", label: `Low Stock (${lowStockCount})` },
                { id: "out_of_stock", label: `Out of Stock (${outOfStockCount})` },
                { id: "inactive", label: "Archived" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setStatusFilter(btn.id as any)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    statusFilter === btn.id
                      ? "bg-white text-indigo-700 shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <span className="animate-spin inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mb-2" />
                <p>Loading inventory items...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <p className="text-3xl">📦</p>
                <p className="text-sm font-semibold text-slate-700">No inventory items found</p>
                <p className="text-xs text-slate-400">
                  {search ? "No items match your search." : "Get started by adding your ingredients and stock items."}
                </p>
                <button
                  onClick={openAddItemModal}
                  className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
                >
                  + Add First Item
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Current Stock</th>
                      <th className="py-3 px-4">Thresholds</th>
                      <th className="py-3 px-4">Cost / Unit</th>
                      <th className="py-3 px-4">Total Value</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div>{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            Linked in {item.linked_recipes_count} menu recipe{item.linked_recipes_count !== 1 ? "s" : ""}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-medium">
                          <span
                            className={`text-sm font-bold ${
                              item.is_out_of_stock
                                ? "text-rose-600"
                                : item.is_low_stock
                                ? "text-amber-600"
                                : "text-slate-900"
                            }`}
                          >
                            {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          </span>{" "}
                          <span className="text-xs text-slate-500 font-normal">{item.unit}</span>
                        </td>

                        <td className="py-3 px-4 text-slate-500">
                          <div className="text-[11px]">
                            Min: <span className="font-medium text-slate-700">{item.minimum_stock} {item.unit}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Reorder: {item.reorder_level} {item.unit}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-700">
                          {item.cost_per_unit ? `₹${item.cost_per_unit.toFixed(2)}` : "—"}
                        </td>

                        <td className="py-3 px-4 font-medium text-slate-900">
                          {item.total_value ? `₹${Math.round(item.total_value).toLocaleString()}` : "—"}
                        </td>

                        <td className="py-3 px-4">
                          {item.is_out_of_stock ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                              🔴 Out of Stock
                            </span>
                          ) : item.is_low_stock ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              ⚠️ Low Stock
                            </span>
                          ) : item.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              🟢 Healthy
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                              Archived
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openTransactionModal(item)}
                              className="px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition"
                              title="Record Stock Adjustment / Purchase / Wastage"
                            >
                              ⚡ Stock In/Out
                            </button>
                            <button
                              onClick={() => openEditItemModal(item)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition"
                              title="Edit Item Thresholds & Pricing"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setHistoryDrawerItem(item)}
                              className="px-2 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition"
                              title="View History"
                            >
                              📜 History
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: TRANSACTION LEDGER
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Ledger Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-slate-500 mr-1">Filter by Type:</span>
              {[
                { id: "ALL", label: "All Transactions" },
                { id: "ORDER_DEDUCTION", label: "Order Deductions" },
                { id: "PURCHASE", label: "Purchases" },
                { id: "WASTAGE", label: "Wastage" },
                { id: "ADJUSTMENT", label: "Adjustments" },
                { id: "REVERSAL", label: "Reversals" },
                { id: "OPENING", label: "Opening Stock" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setLedgerTypeFilter(btn.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    ledgerTypeFilter === btn.id
                      ? "bg-indigo-600 text-white shadow-xs font-semibold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => openTransactionModal()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              + Record Stock Entry
            </button>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {transactions.length === 0 ? (
              <div className="py-16 text-center text-slate-500 space-y-1">
                <p className="text-2xl">📜</p>
                <p className="text-sm font-semibold text-slate-700">No transactions found</p>
                <p className="text-xs text-slate-400">Transactions appear automatically when orders are accepted or manual stock is updated.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Transaction Type</th>
                      <th className="py-3 px-4">Quantity Changed</th>
                      <th className="py-3 px-4">Balance Stock</th>
                      <th className="py-3 px-4">Reference / Reason</th>
                      <th className="py-3 px-4">Estimated Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => {
                      const isDeduction = tx.type === "ORDER_DEDUCTION" || tx.type === "WASTAGE"
                      const isAddition = tx.type === "PURCHASE" || tx.type === "REVERSAL" || tx.type === "OPENING"

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {tx.inventory_item_name}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                tx.type === "ORDER_DEDUCTION"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : tx.type === "PURCHASE"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : tx.type === "WASTAGE"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : tx.type === "REVERSAL"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-bold">
                            <span className={isDeduction ? "text-rose-600" : isAddition ? "text-emerald-600" : "text-slate-800"}>
                              {isDeduction ? "-" : isAddition ? "+" : ""}
                              {tx.quantity} {tx.inventory_item_unit}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            {tx.previous_quantity !== null && tx.new_quantity !== null ? (
                              <span>
                                {tx.previous_quantity} &rarr; <span className="font-semibold text-slate-900">{tx.new_quantity}</span>
                              </span>
                            ) : (
                              <span>{tx.new_quantity ?? "—"}</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                            {tx.order_number ? (
                              <span className="font-medium text-indigo-700">
                                #{tx.order_number} ({tx.order_source})
                              </span>
                            ) : (
                              tx.reason || "Manual update"
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-700 font-medium">
                            {tx.total_cost ? `₹${tx.total_cost.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: ADD / EDIT INVENTORY ITEM
          ───────────────────────────────────────────────────────────── */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {itemToEdit ? "Edit Inventory Item" : "Add New Inventory Item"}
              </h2>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Basmati Rice, Boneless Chicken, Cooking Oil"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Measurement Unit Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Measurement Unit *
                </label>
                <select
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 bg-white font-medium text-slate-800"
                >
                  {INVENTORY_UNIT_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.units.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label} {u.hint ? `(${u.hint})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <optgroup label="Custom / Other">
                    <option value="custom">Custom Unit (e.g. bundle, tray, crate, jar)...</option>
                  </optgroup>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Base unit for storing stock in inventory. Recipe ingredients can use smaller sub-units (e.g. Stock in kg, recipe uses 250 g).
                </p>
              </div>

              {itemUnit === "custom" && (
                <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                  <label className="block text-xs font-semibold text-indigo-900 mb-1">
                    Custom Unit Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. bundle, tray, crate, jar, cup"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 bg-white"
                  />
                  <p className="text-[10px] text-indigo-600 mt-1">
                    Enter the unit name used for tracking and recipe portions.
                  </p>
                </div>
              )}

              {/* Opening Stock (Only for new items) */}
              {!itemToEdit && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Opening Stock ({displayUnit})
                    </label>
                    <span className="text-[10px] font-mono font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      In {displayUnit}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={
                      displayUnit === "kg"
                        ? "e.g. 2.5 (or 25)"
                        : displayUnit === "L"
                        ? "e.g. 0.750 (or 5)"
                        : displayUnit === "g"
                        ? "e.g. 250 (or 500)"
                        : "e.g. 10"
                    }
                    value={itemOpeningStock}
                    onChange={(e) => setItemOpeningStock(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Initial physical stock on hand in <span className="font-semibold text-gray-700">{displayUnit}</span> when adding this item. Supports decimals (e.g. 2.5 kg, 0.750 L, 250 g). Automatically recorded as an OPENING transaction.
                  </p>
                </div>
              )}

              {/* Minimum Stock & Reorder Level */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Minimum Stock Alert ({displayUnit})
                    </label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 1.0 or 5"
                    value={itemMinStock}
                    onChange={(e) => setItemMinStock(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Low-stock warning triggers when inventory drops to or below this level in <span className="font-semibold text-gray-700">{displayUnit}</span>.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Reorder Level ({displayUnit})
                    </label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 5.0 or 10"
                    value={itemReorderLevel}
                    onChange={(e) => setItemReorderLevel(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Recommended replenishment threshold / target restock level in <span className="font-semibold text-gray-700">{displayUnit}</span>.
                  </p>
                </div>
              </div>

              {/* Cost Per Unit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Cost Per Unit (₹ per {displayUnit})
                  </label>
                  <span className="text-[10px] text-gray-400 font-normal">Optional</span>
                </div>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-gray-500 text-xs font-medium">₹</span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={
                      displayUnit === "kg"
                        ? "60.00 (e.g. ₹60 / kg)"
                        : displayUnit === "L"
                        ? "140.00 (e.g. ₹140 / L)"
                        : displayUnit === "piece"
                        ? "8.00 (e.g. ₹8 / piece)"
                        : displayUnit === "g"
                        ? "0.50 (e.g. ₹0.50 / g)"
                        : `e.g. 50.00 per ${displayUnit}`
                    }
                    value={itemCostPerUnit}
                    onChange={(e) => setItemCostPerUnit(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-7 pr-16 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-400 text-[11px] font-medium">/ {displayUnit}</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Purchase cost for 1 {displayUnit} (e.g. Rice → ₹60/kg, Oil → ₹140/L, Eggs → ₹8/piece). Used for calculating total inventory valuation and recipe ingredient costing.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                >
                  {formLoading ? "Saving..." : itemToEdit ? "Update Item" : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: QUICK STOCK IN/OUT (TRANSACTION)
          ───────────────────────────────────────────────────────────── */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">Record Stock Transaction</h2>
              <button
                onClick={() => setIsTransactionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Item *</label>
                <select
                  required
                  value={selectedItemForTx?.id || ""}
                  onChange={(e) => {
                    const found = items.find((i) => i.id === e.target.value)
                    setSelectedItemForTx(found || null)
                    if (found?.cost_per_unit) setTxUnitCost(String(found.cost_per_unit))
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="">Select an inventory item...</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Current: {i.quantity} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Transaction Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "PURCHASE", label: "📥 Purchase / Inward", desc: "Adds to stock" },
                    { id: "WASTAGE", label: "🗑️ Wastage / Loss", desc: "Deducts stock" },
                    { id: "ADJUSTMENT", label: "⚖️ Audit Adjustment", desc: "Corrects balance" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTxType(t.id as any)}
                      className={`p-2.5 rounded-lg border text-left transition ${
                        txType === t.id
                          ? "border-indigo-600 bg-indigo-50/60 text-indigo-900"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-xs font-bold">{t.label}</div>
                      <div className="text-[10px] text-gray-500">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quantity ({selectedItemForTx?.unit || "units"}) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    placeholder="e.g. 10"
                    value={txQuantity}
                    onChange={(e) => setTxQuantity(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Cost Per Unit (₹, Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 50"
                    value={txUnitCost}
                    onChange={(e) => setTxUnitCost(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reason / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Vendor delivery invoice #8812, Spoilage, Weekly stock audit"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsTransactionModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                >
                  {formLoading ? "Recording..." : "Record Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DRAWER: ITEM HISTORY & LINKED RECIPES
          ───────────────────────────────────────────────────────────── */}
      {historyDrawerItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col space-y-4 overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900">{historyDrawerItem.name}</h3>
                <p className="text-xs text-gray-500">
                  Stock: {historyDrawerItem.quantity} {historyDrawerItem.unit} • Threshold: {historyDrawerItem.minimum_stock} {historyDrawerItem.unit}
                </p>
              </div>
              <button
                onClick={() => setHistoryDrawerItem(null)}
                className="text-gray-400 hover:text-gray-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Item Summary</h4>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Opening Stock:</span>
                    <span className="font-semibold text-slate-800">{historyDrawerItem.opening_stock} {historyDrawerItem.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cost Per Unit:</span>
                    <span className="font-semibold text-slate-800">
                      {historyDrawerItem.cost_per_unit ? `₹${historyDrawerItem.cost_per_unit}` : "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Value:</span>
                    <span className="font-semibold text-emerald-700">
                      {historyDrawerItem.total_value ? `₹${Math.round(historyDrawerItem.total_value)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Linked Recipes:</span>
                    <span className="font-semibold text-indigo-700">{historyDrawerItem.linked_recipes_count} menu item(s)</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Recent Ledger Entries
                </h4>
                <div className="text-xs text-slate-500">
                  <Link
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveTab("ledger")
                      setHistoryDrawerItem(null)
                    }}
                    className="text-indigo-600 hover:underline font-medium inline-block mb-2"
                  >
                    View in full transaction ledger &rarr;
                  </Link>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t">
              <button
                onClick={() => {
                  const itm = historyDrawerItem
                  setHistoryDrawerItem(null)
                  openTransactionModal(itm)
                }}
                className="w-full py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"
              >
                + Record Stock Entry for this Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
