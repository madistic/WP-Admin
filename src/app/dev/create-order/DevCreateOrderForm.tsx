"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type MenuItem = { id: string; name: string; price: number; description: string | null; category_id: string; variants: Array<{ id: string; name: string; price: number; is_available: boolean }>; addons: Array<{ id: string; name: string; price: number; is_available: boolean }> }
type Category = { id: string; name: string }
type Restaurant = { id: string; name: string; delivery_fee: number; categories: Category[]; items: MenuItem[] }
type OrderType = "DINING" | "TAKEAWAY" | "HOME_DELIVERY"
type PosPaymentMethod = "CASH" | "ONLINE"
type CartRow = { key: string; menu_item_id: string; name: string; quantity: number; unitPrice: number; variant_id?: string; addon_ids?: string[] }
type SessionItem = { id: string; item_name_snapshot: string; quantity: number; unit_price_snapshot: number; line_total: number; description: string | null }
type ActiveSession = { id: string; order_number: string; customer_name_snapshot: string; table_number: string | null; subtotal: number; total: number; order_type: string; items: SessionItem[] }

export default function DevCreateOrderForm({
  restaurants,
  activeSessions = [],
  createOrderAction,
  appendItemsAction,
  completeOrderAction,
  deleteSessionAction,
  updateItemAction,
}: {
  restaurants: Restaurant[];
  activeSessions?: ActiveSession[];
  createOrderAction: (payload: { restaurant_id: string; order_type: OrderType; table_number?: string; customer_name?: string; customer_phone?: string; address?: string; payment_method?: PosPaymentMethod; items: Array<{ menu_item_id: string; quantity: number; variant_id?: string; addon_ids?: string[] }>; client_request_id: string }) => Promise<{ success?: boolean; orderNumber?: string; error?: string }>;
  appendItemsAction: (payload: { orderId: string; items: Array<{ menu_item_id: string; quantity: number; variant_id?: string; addon_ids?: string[] }> }) => Promise<{ success?: boolean; error?: string }>;
  completeOrderAction: (orderId: string, paymentMethod?: PosPaymentMethod) => Promise<{ success?: boolean; error?: string }>;
  deleteSessionAction: (orderId: string) => Promise<{ success?: boolean; error?: string }>;
  updateItemAction: (payload: { orderId: string; orderItemId: string; action: "set_quantity" | "remove"; quantity?: number }) => Promise<{ success?: boolean; error?: string }>;
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const restaurant = restaurants[0]

  const [activeTab, setActiveTab] = useState<"NEW" | "SESSIONS">("SESSIONS")
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  // Optimistic copy of the active session items for immediate UI feedback
  const [optimisticItems, setOptimisticItems] = useState<SessionItem[] | null>(null)
  const [optimisticTotal, setOptimisticTotal] = useState<number | null>(null)

  const [orderType, setOrderType] = useState<OrderType>("DINING")
  const [categoryId, setCategoryId] = useState("ALL")
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartRow[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH")

  const [tableNumber, setTableNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [address, setAddress] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null)
  const [selectedVariant, setSelectedVariant] = useState("")
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const visibleItems = useMemo(() => restaurant?.items.filter((item) => (categoryId === "ALL" || item.category_id === categoryId) && item.name.toLowerCase().includes(search.toLowerCase().trim())) || [], [restaurant, categoryId, search])

  const subtotal = cart.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0)
  const total = subtotal + (orderType === "HOME_DELIVERY" && activeTab === "NEW" ? restaurant?.delivery_fee || 0 : 0)

  const rawActiveSession = activeSessions.find(s => s.id === selectedSessionId)
  // Use optimistic data if available, otherwise use server data
  const activeSession = rawActiveSession ? {
    ...rawActiveSession,
    items: optimisticItems ?? rawActiveSession.items,
    total: optimisticTotal ?? rawActiveSession.total,
  } : undefined

  function clearSessionOptimistic() {
    setOptimisticItems(null)
    setOptimisticTotal(null)
  }

  function addConfiguredItem(item: MenuItem, variantId?: string, addonIds: string[] = []) {
    const variant = item.variants.find((entry) => entry.id === variantId)
    const addons = addonIds.map((id) => item.addons.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    const key = `${item.id}:${variantId || "base"}:${addonIds.slice().sort().join(",")}`
    const unitPrice = (variant?.price || item.price) + addons.reduce((t, addon) => t + addon.price, 0)
    setCart((current) => {
      const existing = current.find((row) => row.key === key)
      return existing ? current.map((row) => row.key === key ? { ...row, quantity: row.quantity + 1 } : row) : [...current, { key, menu_item_id: item.id, name: item.name, quantity: 1, unitPrice, variant_id: variantId || undefined, addon_ids: addonIds }]
    })
  }
  function addItem(item: MenuItem) {
    if (item.variants.some((v) => v.is_available) || item.addons.some((a) => a.is_available)) {
      setConfiguringItem(item)
      setSelectedVariant(item.variants.find((v) => v.is_available)?.id || "")
      setSelectedAddons([])
      return
    }
    addConfiguredItem(item)
  }
  function changeQuantity(key: string, delta: number) { setCart((current) => current.flatMap((row) => row.key === key ? (row.quantity + delta > 0 ? [{ ...row, quantity: row.quantity + delta }] : []) : [row])) }

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault()
    if (!restaurant) return

    if (activeTab === "NEW") {
      if (cart.length === 0) return setFeedback({ type: "error", text: "Add at least one item." })
      setSubmitting(true); setFeedback(null)
      const clientRequestId = crypto.randomUUID()
      const result = await createOrderAction({ restaurant_id: restaurant.id, order_type: orderType, table_number: tableNumber, customer_name: customerName, customer_phone: customerPhone, address, payment_method: paymentMethod, items: cart.map((row) => ({ menu_item_id: row.menu_item_id, quantity: row.quantity, variant_id: row.variant_id, addon_ids: row.addon_ids })), client_request_id: clientRequestId })
      if (result.error) setFeedback({ type: "error", text: result.error })
      else {
        setFeedback({ type: "success", text: `POS session ${result.orderNumber} started.` })
        setCart([])
        setTableNumber(""); setCustomerName(""); setCustomerPhone("")
        setActiveTab("SESSIONS")
        router.refresh()
      }
      setSubmitting(false)
    } else if (activeTab === "SESSIONS" && selectedSessionId) {
      if (cart.length === 0) return setFeedback({ type: "error", text: "Add at least one item to append." })
      setSubmitting(true); setFeedback(null)
      const result = await appendItemsAction({ orderId: selectedSessionId, items: cart.map((row) => ({ menu_item_id: row.menu_item_id, quantity: row.quantity, variant_id: row.variant_id, addon_ids: row.addon_ids })) })
      if (result.error) setFeedback({ type: "error", text: result.error })
      else {
        setFeedback({ type: "success", text: "Items added to session successfully." })
        setCart([])
        clearSessionOptimistic()
        router.refresh()
      }
      setSubmitting(false)
    }
  }

  async function handleCompleteOrder() {
    if (!selectedSessionId) return
    setSubmitting(true); setFeedback(null)
    const result = await completeOrderAction(selectedSessionId, paymentMethod)
    if (result.error) setFeedback({ type: "error", text: result.error })
    else {
      setFeedback({ type: "success", text: "Order completed and bill generated." })
      setSelectedSessionId(null); setCart([]); clearSessionOptimistic()
      router.refresh()
    }
    setSubmitting(false)
  }

  async function handleDeleteSession() {
    if (!deleteConfirmId) return
    setSubmitting(true); setFeedback(null)
    const result = await deleteSessionAction(deleteConfirmId)
    if (result.error) setFeedback({ type: "error", text: result.error })
    else {
      setFeedback({ type: "success", text: "Session deleted." })
      if (selectedSessionId === deleteConfirmId) { setSelectedSessionId(null); setCart([]); clearSessionOptimistic() }
      router.refresh()
    }
    setDeleteConfirmId(null)
    setSubmitting(false)
  }

  async function handleUpdateItem(orderItemId: string, action: "set_quantity" | "remove", quantity?: number) {
    if (!selectedSessionId || !activeSession) return
    // Optimistic update
    if (action === "remove") {
      const removed = activeSession.items.find(i => i.id === orderItemId)
      const newItems = activeSession.items.filter(i => i.id !== orderItemId)
      setOptimisticItems(newItems)
      setOptimisticTotal((activeSession.total) - (removed?.line_total ?? 0))
    } else if (action === "set_quantity" && quantity !== undefined) {
      const newItems = activeSession.items.map(i => {
        if (i.id !== orderItemId) return i
        const newLineTotal = i.unit_price_snapshot * quantity
        return { ...i, quantity, line_total: newLineTotal }
      })
      const item = activeSession.items.find(i => i.id === orderItemId)
      const delta = item ? (item.unit_price_snapshot * quantity) - item.line_total : 0
      setOptimisticItems(newItems)
      setOptimisticTotal(activeSession.total + delta)
    }

    startTransition(async () => {
      const result = await updateItemAction({ orderId: selectedSessionId, orderItemId, action, quantity })
      if (result.error) {
        setFeedback({ type: "error", text: result.error })
        clearSessionOptimistic() // Revert optimistic changes on error
      } else {
        router.refresh()
      }
    })
  }

  if (!restaurant) return <div className="p-8">No restaurant is available.</div>

  return (
    <div className="space-y-6">
      {/* Delete Confirm Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Delete POS Session?</h2>
            <p className="text-sm text-slate-600">This will permanently remove this session and all its items. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={handleDeleteSession} disabled={submitting} className="flex-1 px-4 py-2.5 rounded-lg bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 disabled:opacity-50">
                {submitting ? "Deleting..." : "Delete Session"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Restaurant POS</h1>
          <p className="text-sm text-slate-500 mt-1">{restaurant.name} · Fast order entry</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
          <button type="button" onClick={() => { setActiveTab("SESSIONS"); setCart([]) }} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === "SESSIONS" ? "bg-white shadow-sm text-indigo-700" : "text-slate-600 hover:text-slate-900"}`}>
            Active Sessions ({activeSessions.length})
          </button>
          <button type="button" onClick={() => { setActiveTab("NEW"); setSelectedSessionId(null); setCart([]); clearSessionOptimistic() }} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === "NEW" ? "bg-white shadow-sm text-indigo-700" : "text-slate-600 hover:text-slate-900"}`}>
            + New POS Order
          </button>
        </div>
      </div>

      {feedback && <div className={`${feedback.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"} rounded-lg border p-4 text-sm font-medium`}>{feedback.text}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* Left Side: Menu or Sessions List */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
          {activeTab === "SESSIONS" && !selectedSessionId ? (
            <div>
              <div className="bg-slate-50 border-b border-slate-200 p-4">
                <h2 className="font-semibold text-slate-800">Open Tables & Takeaway Sessions</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {activeSessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">No active POS sessions. Start a new order.</div>
                ) : (
                  activeSessions.map(session => (
                    <div key={session.id} className="p-5 flex justify-between items-center group transition-colors hover:bg-slate-50">
                      <div className="flex-1 cursor-pointer" onClick={() => { setSelectedSessionId(session.id); clearSessionOptimistic(); setFeedback(null) }}>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900 text-lg">{session.order_number}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {session.order_type}{session.table_number ? ` · Table ${session.table_number}` : ""}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{session.customer_name_snapshot} · {session.items.length} items</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right cursor-pointer" onClick={() => { setSelectedSessionId(session.id); clearSessionOptimistic(); setFeedback(null) }}>
                          <p className="font-bold text-slate-900 text-lg">₹{session.total.toFixed(2)}</p>
                          <p className="text-xs font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity mt-1">Open →</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(session.id) }}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete session"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Search bar */}
              <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 bg-slate-50">
                {activeTab === "SESSIONS" && selectedSessionId && (
                  <button type="button" onClick={() => { setSelectedSessionId(null); setCart([]); clearSessionOptimistic() }} className="mr-2 px-3 py-1.5 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50">← Back</button>
                )}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu..." className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>
              {/* Category sidebar + product grid */}
              <div className="flex flex-1 overflow-hidden">
                {/* Category Sidebar */}
                <div className="w-36 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setCategoryId("ALL")}
                    className={`w-full text-left px-3 py-3 text-xs font-semibold border-b border-slate-100 transition-colors ${categoryId === "ALL" ? "bg-indigo-50 text-indigo-700 border-l-2 border-l-indigo-600" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    All Items
                  </button>
                  {restaurant.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`w-full text-left px-3 py-3 text-xs font-semibold border-b border-slate-100 transition-colors ${categoryId === c.id ? "bg-indigo-50 text-indigo-700 border-l-2 border-l-indigo-600" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {/* Product Grid */}
                <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {visibleItems.map((item) => (
                      <button type="button" key={item.id} onClick={() => addItem(item)} className="h-full min-h-[110px] flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                        <div>
                          <span className="block font-semibold text-slate-900 leading-tight">{item.name}</span>
                          {(item.variants.length > 0 || item.addons.length > 0) && <span className="mt-1 block text-[10px] font-medium text-slate-400 uppercase tracking-wider">Customizable</span>}
                        </div>
                        <span className="mt-3 block text-sm font-bold text-indigo-700">₹{item.price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                  {visibleItems.length === 0 && <div className="text-center p-8 text-slate-500">No items found.</div>}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right Side: Cart / Session Details */}
        <aside className="sticky top-20 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col max-h-[calc(100vh-100px)] overflow-hidden">
          <form onSubmit={submitOrder} className="flex flex-col h-full">

            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
              {activeTab === "NEW" ? (
                <>
                  <h2 className="font-bold text-slate-900 text-lg">New POS Order</h2>
                  <div className="mt-3">
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
                      <option value="DINING">🍽️ Dining</option>
                      <option value="TAKEAWAY">🥡 Takeaway</option>
                    </select>
                  </div>
                </>
              ) : activeSession ? (
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="font-bold text-slate-900 text-lg">{activeSession.order_number}</h2>
                      <p className="text-xs font-semibold text-indigo-700 mt-1">{activeSession.order_type}{activeSession.table_number ? ` · Table ${activeSession.table_number}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded">OPEN</span>
                      <button type="button" onClick={() => setDeleteConfirmId(selectedSessionId!)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Delete session">🗑️</button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 font-medium">{activeSession.customer_name_snapshot}</p>
                </div>
              ) : (
                <div>
                  <h2 className="font-bold text-slate-900 text-lg">Session Details</h2>
                  <p className="text-sm text-slate-500">Select a session to view.</p>
                </div>
              )}
            </div>

            {/* Existing Items for active session with edit controls */}
            {activeTab === "SESSIONS" && activeSession && (
              <div className="overflow-y-auto" style={{ maxHeight: "280px" }}>
                <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Session Items — tap to edit
                </div>
                <div className="divide-y divide-slate-100">
                  {activeSession.items.length === 0 && (
                    <p className="text-xs text-center text-slate-400 p-4">No items in session</p>
                  )}
                  {activeSession.items.map(item => (
                    <div key={item.id} className="p-3 bg-white flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.item_name_snapshot}</p>
                        <p className="text-xs text-slate-500">₹{item.unit_price_snapshot.toFixed(2)} each · ₹{item.line_total.toFixed(2)}</p>
                        {item.description && <p className="text-[10px] text-slate-400 truncate">{item.description}</p>}
                      </div>
                      {/* Quantity controls */}
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity <= 1) {
                              handleUpdateItem(item.id, "remove")
                            } else {
                              handleUpdateItem(item.id, "set_quantity", item.quantity - 1)
                            }
                          }}
                          disabled={isPending}
                          className="h-7 w-7 flex items-center justify-center font-bold text-slate-600 hover:text-rose-700 transition-colors disabled:opacity-40"
                        >
                          {item.quantity <= 1 ? "✕" : "−"}
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(item.id, "set_quantity", item.quantity + 1)}
                          disabled={isPending}
                          className="h-7 w-7 flex items-center justify-center font-bold text-slate-600 hover:text-indigo-700 transition-colors disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cart (new items to add) */}
            {(activeTab === "NEW" || (activeTab === "SESSIONS" && selectedSessionId)) && (
              <div className="flex-1 overflow-y-auto min-h-[120px]">
                {activeTab === "SESSIONS" && cart.length > 0 && (
                  <div className="p-3 bg-indigo-50 border-b border-indigo-100 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    Items to Add
                  </div>
                )}
                {cart.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">
                    {activeTab === "NEW" ? "Tap menu items to build the order." : "Tap menu items to add to this session."}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {cart.map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3 p-3 bg-white">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{row.name}</p>
                          <p className="text-xs font-semibold text-indigo-600 mt-0.5">₹{row.unitPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg border border-slate-200">
                          <button type="button" onClick={() => changeQuantity(row.key, -1)} className="h-8 w-8 flex items-center justify-center font-bold text-slate-600 hover:text-slate-900">−</button>
                          <span className="w-4 text-center text-sm font-bold">{row.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(row.key, 1)} className="h-8 w-8 flex items-center justify-center font-bold text-slate-600 hover:text-slate-900">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {(activeTab === "NEW" || (activeTab === "SESSIONS" && selectedSessionId)) && (
              <div className="border-t border-slate-200 p-4 bg-white space-y-4 rounded-b-xl z-10 shrink-0">
                {/* New session customer details */}
                {activeTab === "NEW" && (
                  <div className="space-y-3 pb-3 border-b border-slate-100">
                    {orderType === "DINING" && (
                      <input required value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Table number *" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 outline-none" />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input required={orderType === "HOME_DELIVERY"} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                      <input required={orderType === "HOME_DELIVERY"} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 outline-none" />
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div>
                  {activeTab === "SESSIONS" && activeSession && (
                    <div className="flex justify-between text-sm text-slate-600 mb-1">
                      <span>Session Subtotal</span>
                      <span>₹{activeSession.total.toFixed(2)}</span>
                    </div>
                  )}
                  {cart.length > 0 && (
                    <div className="flex justify-between text-sm text-slate-600 mb-1">
                      <span>{activeTab === "SESSIONS" ? "+ Items to Add" : "Subtotal"}</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-lg font-bold mt-2 pt-2 border-t border-slate-100">
                    <span>Total Bill</span>
                    <span className="text-indigo-700">₹{((activeSession?.total ?? 0) + total).toFixed(2)}</span>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCart([])} disabled={submitting || cart.length === 0} className="px-4 py-3 rounded-lg bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 disabled:opacity-50">
                    Clear
                  </button>
                  <button type="submit" disabled={submitting || cart.length === 0} className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-all">
                    {submitting ? "Processing..." : activeTab === "NEW" ? "Start Session" : "Add Items to Session"}
                  </button>
                </div>

                {/* Complete Order */}
                {/* Payment Method Selector */}
                {(activeTab === "NEW" || (activeTab === "SESSIONS" && activeSession)) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Payment Type</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("CASH")}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${paymentMethod === "CASH" ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        💵 Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("ONLINE")}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${paymentMethod === "ONLINE" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        📱 Online
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "SESSIONS" && activeSession && (
                  <>
                    <button
                      type="button"
                      onClick={handleCompleteOrder}
                      disabled={submitting || cart.length > 0 || isPending}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      ✅ Complete Order & Generate Bill ({paymentMethod === "CASH" ? "💵 Cash" : "📱 Online"})
                    </button>
                    {cart.length > 0 && (
                      <p className="text-[10px] text-center text-slate-500 font-medium">Add pending items to session first, then complete.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </form>
        </aside>

        {/* Customization Modal */}
        {configuringItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-900">Customize {configuringItem.name}</h2>
                <button type="button" onClick={() => setConfiguringItem(null)} className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">✕</button>
              </div>
              {configuringItem.variants.filter((v) => v.is_available).length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Select Variant</label>
                  <select value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 outline-none">
                    <option value="">Standard Base</option>
                    {configuringItem.variants.filter((v) => v.is_available).map((v) => <option key={v.id} value={v.id}>{v.name} · ₹{v.price.toFixed(2)}</option>)}
                  </select>
                </div>
              )}
              {configuringItem.addons.filter((a) => a.is_available).length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Add-ons</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {configuringItem.addons.filter((a) => a.is_available).map((addon) => (
                      <label key={addon.id} className="flex items-center justify-between text-sm p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300">
                        <span className="flex items-center font-medium text-slate-800">
                          <input type="checkbox" checked={selectedAddons.includes(addon.id)} onChange={() => setSelectedAddons((c) => c.includes(addon.id) ? c.filter((id) => id !== addon.id) : [...c, addon.id])} className="mr-3 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                          {addon.name}
                        </span>
                        <span className="font-semibold text-slate-600">+₹{addon.price.toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => { addConfiguredItem(configuringItem, selectedVariant || undefined, selectedAddons); setConfiguringItem(null) }} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 shadow-sm mt-4">
                Add to Cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
