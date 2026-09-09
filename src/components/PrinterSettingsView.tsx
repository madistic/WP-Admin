"use client"

import { useEffect, useState } from "react"

type PrinterSettings = {
  paperWidth: "79mm" | "58mm"
  companyName: string
  address: string
  phone: string
  gstin: string
  fssai: string
  showCustomer: boolean
  showPhone: boolean
  showOrderType: boolean
  showTable: boolean
  showAddress: boolean
  showPayment: boolean
  showNotes: boolean
  footer: string
}

const defaults: PrinterSettings = { paperWidth: "79mm", companyName: "", address: "", phone: "", gstin: "", fssai: "", showCustomer: true, showPhone: true, showOrderType: true, showTable: true, showAddress: true, showPayment: true, showNotes: true, footer: "Thank you for dining with us!" }

export default function PrinterSettingsView() {
  const [settings, setSettings] = useState<PrinterSettings>(defaults)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  useEffect(() => { fetch("/api/restaurant").then((response) => response.json()).then((data) => { if (data.printer_settings) setSettings({ ...defaults, ...JSON.parse(data.printer_settings) }); else setSettings((current) => ({ ...current, companyName: data.name || "", address: data.address || "", phone: data.phone || "" })) }) }, [])
  function update<K extends keyof PrinterSettings>(key: K, value: PrinterSettings[K]) { setSettings((current) => ({ ...current, [key]: value })) }
  async function save() { setSaving(true); setMessage(""); const response = await fetch("/api/restaurant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printer_settings: settings }) }); setMessage(response.ok ? "Printer settings saved." : "Failed to save settings."); setSaving(false) }
  return <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-6"><section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"><h1 className="text-xl font-semibold">Printer Settings</h1><p className="text-xs text-slate-500">Configure your 3-inch thermal receipt.</p>{([['companyName','Company Name'],['address','Address'],['phone','Phone'],['gstin','GSTIN'],['fssai','FSSAI / License'],['footer','Footer Message']] as const).map(([key, label]) => <label key={key} className="block text-xs font-medium text-slate-700">{label}<input value={settings[key]} onChange={(event) => update(key, event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>)}<select value={settings.paperWidth} onChange={(event) => update("paperWidth", event.target.value as PrinterSettings["paperWidth"])} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="79mm">79mm / 3-inch</option><option value="58mm">58mm</option></select>{(['showCustomer','showPhone','showOrderType','showTable','showAddress','showPayment','showNotes'] as const).map((key) => <label key={key} className="flex gap-2 text-xs"><input type="checkbox" checked={settings[key]} onChange={(event) => update(key, event.target.checked)} /> Show {key.replace('show','')}</label>)}<button onClick={save} disabled={saving} className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Settings"}</button>{message && <p className="text-xs text-emerald-700">{message}</p>}</section><section className="bg-slate-100 rounded-xl p-6 flex justify-center"><div className="bg-white shadow-lg p-5 text-[11px] leading-tight" style={{ width: settings.paperWidth }}><div className="text-center font-bold text-sm">{settings.companyName || "Restaurant Name"}</div><div className="text-center">{settings.address || "Restaurant address"}</div><div className="text-center">{settings.phone || "Phone"}</div>{settings.gstin && <div className="text-center">GSTIN: {settings.gstin}</div>}{settings.fssai && <div className="text-center">FSSAI: {settings.fssai}</div>}<hr className="my-2 border-dashed" />{settings.showOrderType && <div className="font-bold">TAKEAWAY</div>}{settings.showCustomer && <div>Customer: Walk-in Customer</div>}{settings.showPhone && <div>Phone: +91 XXXXX XXXXX</div>}<hr className="my-2 border-dashed" /><div>1 x Sample Burger ........ ₹250.00</div><div>2 x Fries ............... ₹240.00</div><hr className="my-2 border-dashed" /><div className="flex justify-between font-bold"><span>GRAND TOTAL</span><span>₹490.00</span></div>{settings.showPayment && <div>Payment: COD / PENDING</div>}<div className="mt-4 text-center">{settings.footer}</div></div></section></div>
}