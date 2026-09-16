"use client"

import { useState, useEffect } from "react"

export default function CustomerOffersPage() {
  const [segment, setSegment] = useState("ALL")
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [campaignName, setCampaignName] = useState("")
  const [messageTemplate, setMessageTemplate] = useState("We noticed you love {{favorite_item}} 🍗❤️! Come back and enjoy a special offer.")
  
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{type: "success"|"error", text: string} | null>(null)

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
          segment
        })
      })

      const data = await res.json()

      if (res.ok) {
        setFeedback({ 
          type: "success", 
          text: `Campaign complete! Sent: ${data.total_sent} | Failed: ${data.total_failed} | Skipped: ${data.total_skipped}` 
        })
      } else {
        setFeedback({ 
          type: "error", 
          text: data.error + (data.total_failed > 0 ? ` (Failed: ${data.total_failed}, Skipped: ${data.total_skipped})` : "")
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
        <p className="text-sm text-slate-500">Send targeted WhatsApp messages based on purchase history.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: Setup */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="font-semibold text-slate-800 border-b pb-2">1. Select Audience</h2>
            
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Segment</label>
              <select 
                value={segment} 
                onChange={e => setSegment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ALL">All Customers</option>
                <option value="NEW">New (1 order in last 7 days)</option>
                <option value="REGULAR">Regular (2-4 orders in last 30 days)</option>
                <option value="LOYAL">Loyal (5+ orders in last 30 days)</option>
                <option value="INACTIVE">Inactive (No orders in last 30 days)</option>
                <option value="NEVER_PURCHASED">Never Purchased (0 orders)</option>
              </select>
            </div>
            
            <div className="text-sm text-slate-600">
              {loading ? "Loading customers..." : <strong>{customers.length} eligible customers found.</strong>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="font-semibold text-slate-800 border-b pb-2">2. Compose Message</h2>
            
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Campaign Name (Internal)</label>
              <input 
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g. Inactive Win-back 20% Off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">WhatsApp Message</label>
              <textarea 
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">Available variables: <code>{`{{customer_name}}`}</code>, <code>{`{{favorite_item}}`}</code></p>
            </div>
            
            {feedback && (
              <div className={`p-3 rounded-lg text-sm ${feedback.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                {feedback.text}
              </div>
            )}

            <button 
              onClick={sendCampaign}
              disabled={sending || customers.length === 0}
              className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2 font-semibold text-sm disabled:opacity-50"
            >
              {sending ? "Sending..." : `Send to ${customers.length} Customers`}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Preview & Audience List */}
        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Live Preview</h3>
            <div className="bg-[#EFEAE2] p-4 rounded-xl shadow-inner max-w-sm">
              <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm text-sm text-slate-800 whitespace-pre-wrap relative">
                {messageTemplate
                  .replace(/\{\{customer_name\}\}/g, "Saeem")
                  .replace(/\{\{favorite_item\}\}/g, "Chicken Biryani")}
                <div className="text-[10px] text-slate-400 text-right mt-1">12:00 PM</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Note: If you use <code>{`{{favorite_item}}`}</code> and a customer has no favorite item, they will be skipped automatically.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
