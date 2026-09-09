"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type MenuItem = { id: string; name: string; price: number; description: string | null; category_id: string; variants: Array<{ id: string; name: string; price: number; is_available: boolean }>; addons: Array<{ id: string; name: string; price: number; is_available: boolean }> }
type Category = { id: string; name: string }
type Restaurant = { id: string; name: string; delivery_fee: number; categories: Category[]; items: MenuItem[] }
type OrderType = "DINING" | "TAKEAWAY" | "HOME_DELIVERY"
type CartRow = { key: string; menu_item_id: string; name: string; quantity: number; unitPrice: number; variant_id?: string; addon_ids?: string[] }

export default function DevCreateOrderForm({ restaurants, createOrderAction }: { restaurants: Restaurant[]; createOrderAction: (payload: { restaurant_id: string; order_type: OrderType; table_number?: string; customer_name?: string; customer_phone?: string; address?: string; items: Array<{ menu_item_id: string; quantity: number; variant_id?: string; addon_ids?: string[] }>; client_request_id: string }) => Promise<{ success?: boolean; orderNumber?: string; error?: string }> }) {
  const router = useRouter()
  const restaurant = restaurants[0]
  const [orderType, setOrderType] = useState<OrderType>("TAKEAWAY")
  const [categoryId, setCategoryId] = useState("ALL")
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartRow[]>([])
  const [tableNumber, setTableNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [address, setAddress] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null)
  const [selectedVariant, setSelectedVariant] = useState("")
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])

  const visibleItems = useMemo(() => restaurant?.items.filter((item) => (categoryId === "ALL" || item.category_id === categoryId) && item.name.toLowerCase().includes(search.toLowerCase().trim())) || [], [restaurant, categoryId, search])
  const subtotal = cart.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0)
  const total = subtotal + (orderType === "HOME_DELIVERY" ? restaurant?.delivery_fee || 0 : 0)

  function addConfiguredItem(item: MenuItem, variantId?: string, addonIds: string[] = []) {
    const variant = item.variants.find((entry) => entry.id === variantId)
    const addons = addonIds.map((id) => item.addons.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    const key = `${item.id}:${variantId || "base"}:${addonIds.slice().sort().join(",")}`
    const unitPrice = (variant?.price || item.price) + addons.reduce((total, addon) => total + addon.price, 0)
    setCart((current) => {
      const existing = current.find((row) => row.key === key)
      return existing ? current.map((row) => row.key === key ? { ...row, quantity: row.quantity + 1 } : row) : [...current, { key, menu_item_id: item.id, name: item.name, quantity: 1, unitPrice, variant_id: variantId || undefined, addon_ids: addonIds }]
    })
  }
  function addItem(item: MenuItem) {
    if (item.variants.some((variant) => variant.is_available) || item.addons.some((addon) => addon.is_available)) {
      setConfiguringItem(item)
      setSelectedVariant(item.variants.find((variant) => variant.is_available)?.id || "")
      setSelectedAddons([])
      return
    }
    addConfiguredItem(item)
  }
  function changeQuantity(key: string, delta: number) { setCart((current) => current.flatMap((row) => row.key === key ? (row.quantity + delta > 0 ? [{ ...row, quantity: row.quantity + delta }] : []) : [row])) }

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault()
    if (!restaurant || cart.length === 0) return setFeedback({ type: "error", text: "Add at least one item." })
    setSubmitting(true); setFeedback(null)
    const clientRequestId = crypto.randomUUID()
    const result = await createOrderAction({ restaurant_id: restaurant.id, order_type: orderType, table_number: tableNumber, customer_name: customerName, customer_phone: customerPhone, address, items: cart.map((row) => ({ menu_item_id: row.menu_item_id, quantity: row.quantity, variant_id: row.variant_id, addon_ids: row.addon_ids })), client_request_id: clientRequestId })
    if (result.error) setFeedback({ type: "error", text: result.error })
    else { setFeedback({ type: "success", text: `POS order ${result.orderNumber} placed.` }); setCart([]); router.refresh() }
    setSubmitting(false)
  }

  if (!restaurant) return <div className="p-8">No restaurant is available.</div>
  return <form onSubmit={submitOrder} className="min-h-[calc(100vh-7rem)] grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">Restaurant POS</h1><p className="text-xs text-slate-500">{restaurant.name} · Fast order entry</p></div><select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"><option value="DINING">🍽️ Dining</option><option value="TAKEAWAY">🥡 Takeaway</option><option value="HOME_DELIVERY">🛵 Home Delivery</option></select></div>
      {feedback && <div className={`${feedback.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"} rounded-lg border p-3 text-sm`}>{feedback.text}</div>}
      <div className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu..." className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="ALL">All categories</option>{restaurant.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{visibleItems.map((item) => <button type="button" key={item.id} onClick={() => addItem(item)} className="min-h-28 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-400 hover:bg-indigo-50"><span className="block font-semibold text-slate-900">{item.name}</span><span className="mt-2 block text-sm font-bold text-indigo-700">₹{item.price.toFixed(2)}</span>{(item.variants.length > 0 || item.addons.length > 0) && <span className="mt-1 block text-[11px] text-slate-500">Options available</span>}</button>)}</div>
    </section>
    <aside className="xl:sticky xl:top-20 h-fit rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Current Order</h2><p className="text-xs text-slate-500">{cart.reduce((sum, row) => sum + row.quantity, 0)} item(s)</p></div><div className="max-h-72 overflow-y-auto divide-y divide-slate-100">{cart.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Tap menu items to add them.</p> : cart.map((row) => <div key={row.key} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">₹{row.unitPrice.toFixed(2)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => changeQuantity(row.key, -1)} className="h-7 w-7 rounded border">−</button><span className="w-5 text-center text-sm">{row.quantity}</span><button type="button" onClick={() => changeQuantity(row.key, 1)} className="h-7 w-7 rounded border">+</button></div></div>)}</div><div className="space-y-3 border-t border-slate-200 p-4"><div className="flex justify-between text-sm"><span>Subtotal</span><b>₹{subtotal.toFixed(2)}</b></div><div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-indigo-700">₹{total.toFixed(2)}</span></div>{orderType === "DINING" && <input required value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} placeholder="Table number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />}{orderType === "HOME_DELIVERY" && <><input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input required value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><textarea required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} /></>}{orderType !== "HOME_DELIVERY" && <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />}<button type="button" onClick={() => setCart([])} disabled={submitting || cart.length === 0} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium disabled:opacity-50">Clear Cart</button><button type="submit" disabled={submitting || cart.length === 0} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Placing..." : "Place Order"}</button></div></aside>
  {configuringItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4"><div className="flex justify-between"><h2 className="font-semibold">Customize {configuringItem.name}</h2><button type="button" onClick={() => setConfiguringItem(null)}>✕</button></div>{configuringItem.variants.filter((variant) => variant.is_available).length > 0 && <select value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">Standard</option>{configuringItem.variants.filter((variant) => variant.is_available).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · ₹{variant.price.toFixed(2)}</option>)}</select>}{configuringItem.addons.filter((addon) => addon.is_available).map((addon) => <label key={addon.id} className="flex items-center justify-between text-sm"><span><input type="checkbox" checked={selectedAddons.includes(addon.id)} onChange={() => setSelectedAddons((current) => current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id])} className="mr-2" />{addon.name}</span><span>₹{addon.price.toFixed(2)}</span></label>)}<button type="button" onClick={() => { addConfiguredItem(configuringItem, selectedVariant || undefined, selectedAddons); setConfiguringItem(null) }} className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Add to Order</button></div></div>}
  </form>
}
