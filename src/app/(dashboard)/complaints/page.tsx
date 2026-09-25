"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import toast from "react-hot-toast"

type ComplaintStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"

interface Complaint {
  id: string
  restaurant_id: string
  subject: string
  description: string
  status: ComplaintStatus
  response: string | null
  created_at: string
  updated_at: string
}

const STATUS_CONFIG: Record<
  ComplaintStatus,
  {
    label: string
    badgeClass: string
    dotClass: string
    borderClass: string
  }
> = {
  OPEN: {
    label: "Open",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80",
    dotClass: "bg-amber-500",
    borderClass: "border-l-amber-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200/80",
    dotClass: "bg-blue-500 animate-pulse",
    borderClass: "border-l-blue-500",
  },
  RESOLVED: {
    label: "Resolved",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dotClass: "bg-emerald-500",
    borderClass: "border-l-emerald-500",
  },
  CLOSED: {
    label: "Closed",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
    borderClass: "border-l-slate-400",
  },
}

const COMMON_TOPICS = [
  "WhatsApp Bot",
  "Order Management",
  "Menu / Catalog",
  "Printing Setup",
  "Delivery & Charges",
  "Account & Billing",
]

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<"ALL" | ComplaintStatus>("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchComplaints = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    else setRefreshing(true)

    try {
      const res = await fetch("/api/complaints")
      if (!res.ok) {
        throw new Error("Failed to fetch complaints")
      }
      const data = await res.json()
      setComplaints(data.complaints || [])
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "Failed to load complaints")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchComplaints()
  }, [fetchComplaints])

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const trimmedSubject = subject.trim()
    const trimmedDescription = description.trim()

    if (trimmedSubject.length < 3) {
      setFormError("Subject must be at least 3 characters long.")
      return
    }

    if (trimmedDescription.length < 10) {
      setFormError("Description must be at least 10 characters long to provide sufficient detail.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: trimmedSubject,
          description: trimmedDescription,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit complaint")
      }

      toast.success("Complaint raised successfully! Our admin team has received your ticket.")
      setSubject("")
      setDescription("")
      setIsModalOpen(false)
      fetchComplaints(true)
    } catch (err: any) {
      setFormError(err.message || "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered complaints based on tab & search
  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      const matchesTab = activeTab === "ALL" || item.status === activeTab
      const matchesSearch =
        searchQuery === "" ||
        item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [complaints, activeTab, searchQuery])

  // Count metrics
  const counts = useMemo(() => {
    const total = complaints.length
    const open = complaints.filter((c) => c.status === "OPEN").length
    const inProgress = complaints.filter((c) => c.status === "IN_PROGRESS").length
    const resolved = complaints.filter((c) => c.status === "RESOLVED").length
    const closed = complaints.filter((c) => c.status === "CLOSED").length
    return { total, open, inProgress, resolved, closed }
  }, [complaints])

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Complaints & Support</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Raise grievances, issues, or requests directly to platform administration. Track responses and status updates here.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchComplaints(true)}
            disabled={refreshing || loading}
            title="Refresh list"
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin text-indigo-600" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          <button
            onClick={() => {
              setFormError(null)
              setIsModalOpen(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 transition-all hover:shadow hover:shadow-indigo-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Raise Complaint</span>
          </button>
        </div>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveTab("ALL")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
              : "bg-white text-slate-700 border-slate-200/80 hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-medium uppercase tracking-wider opacity-75">All Complaints</div>
          <div className="text-2xl font-bold mt-1">{counts.total}</div>
        </div>

        <div
          onClick={() => setActiveTab("OPEN")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === "OPEN"
              ? "bg-amber-600 text-white border-amber-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200/80 hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-600">Pending Review</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{counts.open}</div>
        </div>

        <div
          onClick={() => setActiveTab("IN_PROGRESS")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === "IN_PROGRESS"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200/80 hover:border-blue-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-blue-600">In Progress</span>
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{counts.inProgress}</div>
        </div>

        <div
          onClick={() => setActiveTab("RESOLVED")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === "RESOLVED"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200/80 hover:border-emerald-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-600">Resolved</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{counts.resolved}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(
            [
              { key: "ALL", label: "All" },
              { key: "OPEN", label: "Open" },
              { key: "IN_PROGRESS", label: "In Progress" },
              { key: "RESOLVED", label: "Resolved" },
              { key: "CLOSED", label: "Closed" },
            ] as const
          ).map((tab) => {
            const isCurrent = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isCurrent
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search complaints..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Complaints List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading your complaints...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto text-2xl mb-4">
            {searchQuery ? "🔍" : "📨"}
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            {searchQuery ? "No matching complaints found" : "No complaints recorded"}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
            {searchQuery
              ? "Try adjusting your search criteria or switching to a different status tab."
              : "Whenever you encounter a technical issue, WhatsApp connectivity problem, or request assistance, raise a complaint to track it directly."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => {
                setFormError(null)
                setIsModalOpen(true)
              }}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
            >
              <span>+ Raise Your First Complaint</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredComplaints.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN
            const shortTicketId = item.id.substring(0, 8).toUpperCase()

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden border-l-4 ${statusConfig.borderClass}`}
              >
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Top Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          #CMP-{shortTicketId}
                        </span>
                        <h2 className="text-base font-bold text-slate-900 leading-snug">{item.subject}</h2>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Raised on {formatDate(item.created_at)}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                        <span>{statusConfig.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Complaint Description */}
                  <div className="text-xs text-slate-700 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">
                    {item.description}
                  </div>

                  {/* Admin / System Response Box */}
                  {item.response ? (
                    <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100/90 text-slate-900 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🛡️</span>
                          <span>Admin / Platform Response</span>
                        </div>
                        <span className="text-[11px] font-normal text-indigo-600">
                          Updated: {formatDate(item.updated_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed pl-5 border-l-2 border-indigo-300">
                        {item.response}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-dashed border-slate-200">
                      <span>⏳</span>
                      <span>Awaiting review and reply from platform administrators.</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Raise Complaint Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => {
              if (!submitting) setIsModalOpen(false)
            }}
          />

          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Raise a Complaint</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit your grievance or issue to the platform support team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={submitting}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateComplaint} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Quick Topic Helpers */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Common Topics
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        if (!subject.includes(topic)) {
                          setSubject(subject ? `[${topic}] ${subject}` : `[${topic}] `)
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-lg transition-colors border border-slate-200/70"
                    >
                      +{topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. WhatsApp automated catalog order failure"
                  maxLength={200}
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400">
                  <span>Summarize the issue clearly</span>
                  <span>{subject.length}/200</span>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detailed Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what happened, what you observed, order numbers or error messages, and any reproduction steps..."
                  maxLength={5000}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
                />
                <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400">
                  <span>Include specific IDs, error logs or timestamps if possible</span>
                  <span>{description.length}/5000</span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {submitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{submitting ? "Submitting..." : "Submit Complaint"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
