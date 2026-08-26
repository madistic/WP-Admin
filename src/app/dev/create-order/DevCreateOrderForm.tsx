"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface MenuItem {
  id: string
  name: string
  price: number
}

interface Restaurant {
  id: string
  name: string
  delivery_fee: number
  items: MenuItem[]
}

interface DevCreateOrderFormProps {
  restaurants: Restaurant[]
  createOrderAction: (payload: {
    restaurant_id: string
    customer_name: string
    customer_phone: string
    address: string
    items: Array<{
      menu_item_id: string
      quantity: number
      description?: string
    }>
  }) => Promise<{ success?: boolean; orderNumber?: string; error?: string }>
}

interface SelectedItemRow {
  rowId: string
  menu_item_id: string
  quantity: number
  description: string
}

export default function DevCreateOrderForm({ restaurants, createOrderAction }: DevCreateOrderFormProps) {
  const router = useRouter()
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(restaurants[0]?.id || "")
  const [customerName, setCustomerName] = useState("Madi")
  const [customerPhone, setCustomerPhone] = useState("+919876543211")
  const [address, setAddress] = useState("123 Test Street, Apartment 4B")

  const currentRestaurant = restaurants.find((r) => r.id === selectedRestaurantId) || restaurants[0]

  // Order Items state
  const [orderItems, setOrderItems] = useState<SelectedItemRow[]>([
    {
      rowId: "row-1",
      menu_item_id: currentRestaurant?.items[0]?.id || "",
      quantity: 1,
      description: "",
    },
  ])

  // Search selector modal state
  const [itemSearchModalOpen, setItemSearchModalOpen] = useState(false)
  const [activeRowIdForSelect, setActiveRowIdForSelect] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Calculate totals client-side for live preview
  const itemsBreakdown = orderItems.map((row) => {
    const menuItem = currentRestaurant?.items.find((item) => item.id === row.menu_item_id)
    const unitPrice = menuItem?.price || 0
    const lineTotal = unitPrice * row.quantity
    return {
      ...row,
      item_name: menuItem?.name || "Select an item...",
      unitPrice,
      lineTotal,
    }
  })

  const subtotal = itemsBreakdown.reduce((sum, item) => sum + item.lineTotal, 0)
  const deliveryFee = currentRestaurant?.delivery_fee || 0
  const grandTotal = subtotal + deliveryFee

  // Handle adding another item row
  function handleAddItemRow() {
    const defaultItem = currentRestaurant?.items[0]?.id || ""
    const newRowId = `row-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    setOrderItems((prev) => [
      ...prev,
      {
        rowId: newRowId,
        menu_item_id: defaultItem,
        quantity: 1,
        description: "",
      },
    ])
  }

  // Handle removing item row
  function handleRemoveItemRow(rowId: string) {
    setOrderItems((prev) => prev.filter((item) => item.rowId !== rowId))
  }

  // Handle quantity change
  function handleQuantityChange(rowId: string, delta: number) {
    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.rowId === rowId) {
          const newQty = Math.max(1, item.quantity + delta)
          return { ...item, quantity: newQty }
        }
        return item
      })
    )
  }

  function handleQuantityInput(rowId: string, val: string) {
    const parsed = parseInt(val, 10)
    const qty = isNaN(parsed) || parsed < 1 ? 1 : parsed
    setOrderItems((prev) =>
      prev.map((item) => (item.rowId === rowId ? { ...item, quantity: qty } : item))
    )
  }

  // Handle description change
  function handleDescriptionChange(rowId: string, text: string) {
    setOrderItems((prev) =>
      prev.map((item) => (item.rowId === rowId ? { ...item, description: text } : item))
    )
  }

  // Open menu item selector search modal
  function openItemSelector(rowId: string) {
    setActiveRowIdForSelect(rowId)
    setSearchTerm("")
    setItemSearchModalOpen(true)
  }

  function selectMenuItem(menuItemId: string) {
    if (activeRowIdForSelect) {
      setOrderItems((prev) =>
        prev.map((item) => (item.rowId === activeRowIdForSelect ? { ...item, menu_item_id: menuItemId } : item))
      )
    }
    setItemSearchModalOpen(false)
    setActiveRowIdForSelect(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    if (!selectedRestaurantId) {
      setFeedback({ type: "error", message: "Please select a restaurant." })
      setSubmitting(false)
      return
    }

    if (orderItems.length === 0) {
      setFeedback({ type: "error", message: "Please add at least one menu item to the order." })
      setSubmitting(false)
      return
    }

    // Validate that all items have a valid menu item selected
    const invalidItem = orderItems.find((item) => !item.menu_item_id)
    if (invalidItem) {
      setFeedback({ type: "error", message: "Please ensure all item rows have a menu item selected." })
      setSubmitting(false)
      return
    }

    try {
      const payload = {
        restaurant_id: selectedRestaurantId,
        customer_name: customerName,
        customer_phone: customerPhone,
        address,
        items: orderItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          description: item.description || undefined,
        })),
      }

      const res = await createOrderAction(payload)
      if (res.error) {
        setFeedback({ type: "error", message: res.error })
      } else if (res.success) {
        setFeedback({
          type: "success",
          message: `Order #${res.orderNumber} successfully created and synced to active Orders board!`,
        })
        router.refresh()
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to create order" })
    } finally {
      setSubmitting(false)
    }
  }

  const filteredMenuItems = currentRestaurant?.items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Create Test Multi-Item Order</h2>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Simulate direct WhatsApp/Customer order placement with multiple items and item instructions.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg text-xs font-medium ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-xs font-normal">
        {/* Restaurant Selector */}
        <div>
          <label className="block font-medium text-slate-700 mb-1">Select Restaurant *</label>
          <select
            value={selectedRestaurantId}
            onChange={(e) => {
              setSelectedRestaurantId(e.target.value)
              const newRest = restaurants.find((r) => r.id === e.target.value)
              if (newRest && newRest.items.length > 0) {
                setOrderItems([
                  {
                    rowId: `row-${Date.now()}`,
                    menu_item_id: newRest.items[0].id,
                    quantity: 1,
                    description: "",
                  },
                ])
              }
            }}
            required
            className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-indigo-600"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Customer Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Customer Name *</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Customer Phone (+91) *</label>
            <input
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-700 mb-1">Delivery Address *</label>
          <textarea
            rows={2}
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
          />
        </div>

        {/* Order Items Section */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900">Order Items</h3>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-xs rounded-lg transition-colors border border-indigo-200"
            >
              + Add Another Item
            </button>
          </div>

          <div className="space-y-3">
            {orderItems.map((item, index) => {
              const selectedMenuObj = currentRestaurant?.items.find((m) => m.id === item.menu_item_id)
              return (
                <div
                  key={item.rowId}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 relative"
                >
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-semibold text-slate-700 text-xs">Item {index + 1}</span>
                    {orderItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(item.rowId)}
                        className="text-rose-600 hover:text-rose-800 font-medium text-xs"
                      >
                        [Remove Item]
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    {/* Item Selector Button */}
                    <div className="md:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">Select Menu Item</label>
                      <button
                        type="button"
                        onClick={() => openItemSelector(item.rowId)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white text-left flex justify-between items-center hover:border-indigo-500 transition-colors"
                      >
                        <span className="font-medium">
                          {selectedMenuObj ? selectedMenuObj.name : "Select an item..."}
                        </span>
                        <span className="font-semibold text-indigo-600">
                          {selectedMenuObj ? `₹${selectedMenuObj.price}` : ""}
                        </span>
                      </button>
                    </div>

                    {/* Quantity Control */}
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Quantity</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.rowId, -1)}
                          className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleQuantityInput(item.rowId, e.target.value)}
                          className="w-16 p-2 text-center border border-slate-300 rounded-lg font-semibold text-slate-900 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.rowId, 1)}
                          className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Special Instructions */}
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Special Instructions <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Less salt, no onions, less spicy..."
                      value={item.description}
                      onChange={(e) => handleDescriptionChange(item.rowId, e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white placeholder-slate-400"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live Order Summary Preview */}
        <div className="bg-slate-900 text-white p-5 rounded-xl space-y-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            ORDER SUMMARY PREVIEW
          </h3>

          <div className="space-y-2 divide-y divide-slate-800/60">
            {itemsBreakdown.map((b, idx) => (
              <div key={idx} className="pt-2">
                <div className="flex justify-between items-start font-medium text-sm">
                  <span>
                    {b.quantity} × {b.item_name}
                  </span>
                  <span className="font-semibold">₹{b.lineTotal.toFixed(2)}</span>
                </div>
                {b.description && (
                  <p className="text-xs text-indigo-300 italic mt-0.5 ml-3">↳ {b.description}</p>
                )}
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-medium text-white">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery Fee</span>
              <span className="font-medium text-white">₹{deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-white pt-2 border-t border-slate-700">
              <span>TOTAL</span>
              <span className="text-indigo-400">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs text-sm"
          >
            {submitting ? "Processing Order..." : "PLACE ORDER (COD)"}
          </button>
        </div>
      </form>

      {/* Menu Item Search Modal */}
      {itemSearchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 border border-slate-200 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Select Menu Item</h3>
              <button
                type="button"
                onClick={() => setItemSearchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <input
                type="text"
                autoFocus
                placeholder="Search menu items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg text-slate-900 bg-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {filteredMenuItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No matching menu items found.</div>
              ) : (
                filteredMenuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMenuItem(item.id)}
                    className="w-full p-3 text-left hover:bg-indigo-50 flex justify-between items-center transition-colors text-xs"
                  >
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="font-semibold text-indigo-600">₹{item.price}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
