"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"

function CustomerOffersContent() {
  const searchParams = useSearchParams()
  const initialSegment = searchParams.get("segment") || "ALL"

  const [segment, setSegment] = useState(initialSegment)
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [campaignName, setCampaignName] = useState("")
  const [messageTemplate, setMessageTemplate] = useState(
    "We noticed you love {{favorite_item}} 🍗❤️! Come back and enjoy a special offer."
  )

  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    const qSegment = searchParams.get("segment")
    if (qSegment) {
      setSegment(qSegment)
    }
  }, [searchParams])

  useEffect(() => {
    fetchCustomers()
  }, [segment])

  async function fetchCustomers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/customers?segment=${segment}`)
      if (res.ok) {
        const data = await res.json()
        setCustomers(data)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function sendCampaign() {
    if (!campaignName.trim() || !messageTemplate.trim()) {
      setFeedback({ type: "error", text: "Name and message template are required." })
      return
    }

    setSending(true)
    setFeedback(null)

    try {
      const res = await fetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          message_template: messageTemplate,
          segment,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setFeedback({
          type: "success",
          text: `Campaign complete! Sent: ${data.total_sent} | Failed: ${data.total_failed} | Skipped: ${data.total_skipped}`,
        })
      } else {
        setFeedback({
          type: "error",
          text: data.error + (data.total_failed > 0 ? ` (Failed: ${data.total_failed}, Skipped: ${data.total_skipped})` : ""),
        })
      }
    } catch (e: any) {
      setFeedback({ type: "error", text: e.message || "An error occurred." })
    }
    setSending(false)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customer Offers & CRM</h1>
        <p className="text-sm text-slate-500">
          Send targeted WhatsApp promotions based on real-time Customer Analytics and RFM segmentation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT COLUMN: Setup */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="font-semibold text-slate-800 border-b pb-2">1. Select Target Audience</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Segment</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              >
                <option value="ALL">All Customers</option>
                <optgroup label="Customer Analytics RFM Segments">
                  <option value="RFM_CHAMPIONS">🏆 Champions (Top Recency, Frequency & Spend)</option>
                  <option value="RFM_LOYAL_CUSTOMERS">⭐ Loyal Customers (Buy Regularly, Good Spenders)</option>
                  <option value="RFM_POTENTIAL_LOYALISTS">✨ Potential Loyalists (Recent Repeat Diners)</option>
                  <option value="RFM_NEW_CUSTOMERS">🆕 New Customers (Recent First-Time Diners)</option>
                  <option value="RFM_PROMISING">🎯 Promising Customers (Recent Buyers, Growing)</option>
                  <option value="RFM_NEED_ATTENTION">⚡ Need Attention (Above Average, Needs Push)</option>
                  <option value="RFM_ABOUT_TO_SLEEP">💤 About to Sleep (Below Average Recency/Frequency)</option>
                  <option value="RFM_AT_RISK">⚠️ At-Risk Customers (High Spenders Slipping Away)</option>
                  <option value="RFM_CANT_LOSE_THEM">🚨 Can't Lose Them (Former Regulars, Long Inactive)</option>
                  <option value="RFM_LOW_MONETARY">🪙 Low-Monetary Customers (Price Sensitive / Small Spenders)</option>
                  <option value="RFM_LOST">📉 Lost Customers (Lowest R-F-M)</option>
                </optgroup>
                <optgroup label="Standard Time-Window Segments">
                  <option value="NEW">New (1 order in last 7 days)</option>
                  <option value="REGULAR">Regular (2-4 orders in last 30 days)</option>
                  <option value="LOYAL">Loyal (5+ orders in last 30 days)</option>
                  <option value="INACTIVE">Inactive (No orders in last 30 days)</option>
                  <option value="NEVER_PURCHASED">Never Purchased (0 orders)</option>
                </optgroup>
              </select>
            </div>

            <div className="text-sm text-slate-600 flex items-center justify-between">
              {loading ? (
                <span className="text-xs text-slate-400">Loading customers...</span>
              ) : (
                <span className="text-xs font-semibold text-slate-800">
                  {customers.length} eligible customer{customers.length === 1 ? "" : "s"} found for this segment.
                </span>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="font-semibold text-slate-800 border-b pb-2">2. Compose Campaign Message</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. VIP Loyalty Win-Back Offer"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Message Template</label>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white font-sans"
              />
              <p className="text-xs text-slate-400 mt-1">
                Available variables: <code>{`{{customer_name}}`}</code>, <code>{`{{favorite_item}}`}</code>
              </p>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  feedback.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              onClick={sendCampaign}
              disabled={sending || customers.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2.5 font-semibold text-xs disabled:opacity-50 transition-colors shadow-xs"
            >
              {sending ? "Sending via WhatsApp..." : `Send Offer to ${customers.length} Customer${customers.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Preview & Audience List */}
        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">WhatsApp Live Preview</h3>
            <div className="bg-[#EFEAE2] p-4 rounded-xl shadow-inner max-w-sm">
              <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-xs text-xs text-slate-800 whitespace-pre-wrap relative leading-relaxed">
                {messageTemplate
                  .replace(/\{\{customer_name\}\}/g, "Saeem")
                  .replace(/\{\{favorite_item\}\}/g, "Special Biryani")}
                <div className="text-[10px] text-slate-400 text-right mt-1.5">12:00 PM · WhatsApp</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Note: If you use <code>{`{{favorite_item}}`}</code> and a customer has no favorite item on record, the sentence is personalized cleanly.
            </p>
          </div>

          {/* Targeted Diners Roster Preview */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Targeted Diners Sample</h3>
              <span className="text-[11px] text-slate-500 font-medium">{customers.length} Diners</span>
            </div>

            {customers.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No diners match the selected segment.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                {customers.slice(0, 15).map((c: any) => (
                  <div key={c.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{c.name || "Customer"}</div>
                      <div className="text-[11px] text-slate-400">{c.whatsapp_number || c.phone}</div>
                    </div>
                    {c.rfm && (
                      <div className="text-right">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {c.rfm.rfmSegment}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">RFM: {c.rfm.rfmScore}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CustomerOffersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading Customer Offers...</div>}>
      <CustomerOffersContent />
    </Suspense>
  )
}
