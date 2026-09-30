"use client"

import { useEffect, useState } from "react"
import {
  PrinterSettings,
  KotPrinterConfig,
  defaultPrinterSettings,
  triggerOneClickKotPrint,
  triggerOneClickReceiptPrint,
} from "@/lib/printing"

export default function PrinterSettingsView() {
  const [settings, setSettings] = useState<PrinterSettings>(defaultPrinterSettings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  // New KOT printer form
  const [newKotName, setNewKotName] = useState("")
  const [newKotType, setNewKotType] = useState<"browser" | "network">("browser")
  const [newKotIp, setNewKotIp] = useState("")
  const [newKotCategories, setNewKotCategories] = useState("ALL")

  useEffect(() => {
    fetch("/api/restaurant")
      .then((response) => response.json())
      .then((data) => {
        if (data.printer_settings) {
          try {
            const parsed = JSON.parse(data.printer_settings)
            setSettings({ ...defaultPrinterSettings, ...parsed })
          } catch {
            setSettings(defaultPrinterSettings)
          }
        } else {
          setSettings((current) => ({
            ...current,
            companyName: data.name || "",
            address: data.address || "",
            phone: data.phone || "",
          }))
        }
      })
      .catch((e) => console.error("Error loading printer settings", e))
  }, [])

  function update<K extends keyof PrinterSettings>(key: K, value: PrinterSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer_settings: settings }),
      })
      setMessage(response.ok ? "Printer settings and KOT routing saved." : "Failed to save settings.")
    } catch {
      setMessage("Failed to save settings.")
    } finally {
      setSaving(false)
    }
  }

  function addKotPrinter() {
    if (!newKotName.trim()) return
    const newPrinter: KotPrinterConfig = {
      id: `kot-${Date.now()}`,
      name: newKotName.trim(),
      type: newKotType,
      ipAddress: newKotType === "network" ? newKotIp.trim() : undefined,
      paperWidth: settings.paperWidth || "79mm",
      categories: newKotCategories.split(",").map((c) => c.trim()).filter(Boolean),
      enabled: true,
    }
    setSettings((cur) => ({
      ...cur,
      kotPrinters: [...(cur.kotPrinters || []), newPrinter],
    }))
    setNewKotName("")
    setNewKotIp("")
    setNewKotCategories("ALL")
  }

  function removeKotPrinter(id: string) {
    setSettings((cur) => ({
      ...cur,
      kotPrinters: (cur.kotPrinters || []).filter((p) => p.id !== id),
    }))
  }

  function toggleKotPrinter(id: string) {
    setSettings((cur) => ({
      ...cur,
      kotPrinters: (cur.kotPrinters || []).map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    }))
  }

  const sampleOrder = {
    id: "sample-1",
    order_number: "ORD-101",
    created_at: new Date(),
    order_type: "TAKEAWAY",
    customer_name_snapshot: "Walk-in Diner",
    customer_phone_snapshot: "+91 98765 43210",
    delivery_address_snapshot: "Counter Pickup",
    payment_method: "UPI",
    payment_status: "PAID",
    subtotal: 490,
    delivery_fee: 0,
    total: 490,
    notes: "Extra spicy, pack sauces separately",
    items: [
      { item_name_snapshot: "Sample Special Burger", quantity: 1, line_total: 250, description: "With extra cheese" },
      { item_name_snapshot: "Crispy French Fries", quantity: 2, line_total: 240 },
    ],
  }

  async function testReceiptPrint() {
    await triggerOneClickReceiptPrint(sampleOrder, settings)
  }

  async function testKotPrint(printer?: KotPrinterConfig) {
    const testSettings: PrinterSettings = {
      ...settings,
      kotPrinters: printer ? [printer] : settings.kotPrinters,
    }
    await triggerOneClickKotPrint(sampleOrder, testSettings)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Printer Settings & KOT Routing</h1>
        <p className="text-xs text-slate-500 font-normal mt-0.5">
          Configure thermal customer receipts and configure multi-printer KOT dispatch for your kitchen stations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT COLUMN: Settings Form */}
        <div className="space-y-6">
          {/* 1. Receipt Configuration */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-semibold text-slate-900">Receipt Design & Branding</h2>
              <button
                type="button"
                onClick={testReceiptPrint}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <span>🖨️</span>
                <span>Test Receipt Print</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["companyName", "Company / Restaurant Name"],
                  ["address", "Restaurant Address"],
                  ["phone", "Phone Number"],
                  ["gstin", "GSTIN Number"],
                  ["fssai", "FSSAI / License"],
                  ["footer", "Receipt Footer Message"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs font-medium text-slate-700">
                  {label}
                  <input
                    value={settings[key] || ""}
                    onChange={(event) => update(key, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                  />
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Receipt Paper Width</label>
              <select
                value={settings.paperWidth}
                onChange={(event) => update("paperWidth", event.target.value as PrinterSettings["paperWidth"])}
                className="w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
              >
                <option value="79mm">79mm / 3-inch (Standard Thermal)</option>
                <option value="58mm">58mm / 2-inch (Compact Thermal)</option>
              </select>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Receipt Display Elements</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {(
                  [
                    ["showCustomer", "Show Customer"],
                    ["showPhone", "Show Phone"],
                    ["showOrderType", "Show Order Type"],
                    ["showTable", "Show Table Number"],
                    ["showAddress", "Show Delivery Address"],
                    ["showPayment", "Show Payment Info"],
                    ["showNotes", "Show Order Notes"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings[key] !== false}
                      onChange={(event) => update(key, event.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* 2. KOT Multi-Printer Routing */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Kitchen KOT Printers & Stations</h2>
                <p className="text-[11px] text-slate-500">
                  Print KOTs to all connected printers simultaneously (e.g. Main Kitchen, Bar, Grill station).
                </p>
              </div>
              <button
                type="button"
                onClick={() => testKotPrint()}
                className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors flex items-center gap-1 border border-indigo-200"
              >
                <span>🍳</span>
                <span>Test KOT (All Connected)</span>
              </button>
            </div>

            {/* Configured Printers List */}
            <div className="space-y-2.5">
              {(!settings.kotPrinters || settings.kotPrinters.length === 0) ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  No dedicated KOT printers added. KOT will automatically print via your default system printer.
                </div>
              ) : (
                settings.kotPrinters.map((printer) => (
                  <div
                    key={printer.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-colors ${
                      printer.enabled
                        ? "bg-slate-50/70 border-slate-200"
                        : "bg-slate-100/50 border-slate-200 text-slate-400 opacity-60"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">{printer.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            printer.type === "network"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {printer.type === "network" ? `Network (${printer.ipAddress || "No IP"})` : "Browser Print"}
                        </span>
                        {printer.enabled && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 font-semibold">
                            Connected / Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Categories:{" "}
                        <span className="font-medium text-slate-700">
                          {printer.categories && printer.categories.length > 0
                            ? printer.categories.join(", ")
                            : "ALL Dishes"}
                        </span>{" "}
                        · Width: {printer.paperWidth || settings.paperWidth || "79mm"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => testKotPrint(printer)}
                        className="px-2 py-1 text-[11px] font-medium bg-white hover:bg-slate-50 border border-slate-200 rounded text-slate-700"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleKotPrinter(printer.id)}
                        className={`px-2 py-1 text-[11px] font-medium rounded ${
                          printer.enabled
                            ? "bg-amber-100 hover:bg-amber-200 text-amber-800"
                            : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                        }`}
                      >
                        {printer.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeKotPrinter(printer.id)}
                        className="px-2 py-1 text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add KOT Printer Form */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <span className="text-xs font-semibold text-slate-800 block">Add KOT Kitchen Printer</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-600 block mb-0.5 font-medium">Station / Printer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Kitchen, Bar Station"
                    value={newKotName}
                    onChange={(e) => setNewKotName(e.target.value)}
                    className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 block mb-0.5 font-medium">Printer Type</label>
                  <select
                    value={newKotType}
                    onChange={(e) => setNewKotType(e.target.value as any)}
                    className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="browser">Browser / Windows Printer</option>
                    <option value="network">Network IP (ESC/POS)</option>
                  </select>
                </div>
                {newKotType === "network" ? (
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5 font-medium">IP Address & Port</label>
                    <input
                      type="text"
                      placeholder="192.168.1.100:9100"
                      value={newKotIp}
                      onChange={(e) => setNewKotIp(e.target.value)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5 font-medium">Target Categories</label>
                    <input
                      type="text"
                      placeholder="ALL or comma separated"
                      value={newKotCategories}
                      onChange={(e) => setNewKotCategories(e.target.value)}
                      className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                )}
              </div>

              {newKotType === "network" && (
                <div>
                  <label className="text-[11px] text-slate-600 block mb-0.5 font-medium">Target Categories</label>
                  <input
                    type="text"
                    placeholder="ALL or comma separated categories (e.g. Beverages, Mocktails)"
                    value={newKotCategories}
                    onChange={(e) => setNewKotCategories(e.target.value)}
                    className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addKotPrinter}
                  disabled={!newKotName.trim()}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  + Add KOT Station Printer
                </button>
              </div>
            </div>
          </section>

          {/* Save Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white disabled:opacity-50 transition-colors shadow-xs"
            >
              {saving ? "Saving Configuration..." : "Save All Printer Settings"}
            </button>
            {message && (
              <p
                className={`text-xs font-medium ${
                  message.includes("saved") ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Receipt Preview */}
        <section className="bg-slate-100 rounded-xl p-5 flex flex-col items-center justify-start border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Live Receipt Preview
          </span>
          <div
            className="bg-white shadow-md p-4 text-[11px] leading-tight border border-slate-200"
            style={{ width: settings.paperWidth }}
          >
            <div className="text-center font-bold text-sm">{settings.companyName || "Restaurant Name"}</div>
            <div className="text-center text-slate-600">{settings.address || "Restaurant address"}</div>
            <div className="text-center text-slate-600">{settings.phone || "Phone"}</div>
            {settings.gstin && <div className="text-center">GSTIN: {settings.gstin}</div>}
            {settings.fssai && <div className="text-center">FSSAI: {settings.fssai}</div>}
            <hr className="my-2 border-dashed border-slate-400" />
            <div className="font-bold">Order: ORD-101</div>
            <div className="text-[10px] text-slate-500">{new Date().toLocaleString("en-IN")}</div>
            {settings.showOrderType && <div className="font-bold mt-1">TAKEAWAY</div>}
            {settings.showCustomer && <div>Customer: Walk-in Diner</div>}
            {settings.showPhone && <div>Phone: +91 98765 43210</div>}
            <hr className="my-2 border-dashed border-slate-400" />
            <div>1 x Sample Special Burger ........ ₹250.00</div>
            <div>2 x Crispy French Fries .......... ₹240.00</div>
            <hr className="my-2 border-dashed border-slate-400" />
            <div className="flex justify-between font-bold">
              <span>GRAND TOTAL</span>
              <span>₹490.00</span>
            </div>
            {settings.showPayment && <div className="mt-1">Payment: UPI / PAID</div>}
            <div className="mt-4 text-center text-slate-600 whitespace-pre-wrap">{settings.footer}</div>
          </div>
        </section>
      </div>
    </div>
  )
}