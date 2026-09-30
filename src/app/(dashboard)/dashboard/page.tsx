"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import OrderDrawer from "@/components/OrderDrawer"
import { RFM_SEGMENT_DEFINITIONS, RFMSegmentKey } from "@/lib/rfm"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from "chart.js"
import { Bar, Line, Doughnut } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
)

// ─────────────────────────────────────────────────────────────
// REUSABLE HELPER UI COMPONENTS
// ─────────────────────────────────────────────────────────────

// Growth indicator badge (Strictly handles null/NaN/0-prior as N/A, never Infinity or 100%)
function GrowthBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || isNaN(value)) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
        N/A
      </span>
    )
  }

  if (value > 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        +{value}%
      </span>
    )
  }

  if (value < 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        {value}%
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
      0.0%
    </span>
  )
}

// Tooltip / Calculation Formula Popover
function FormulaInfo({
  title,
  formula,
  explanation,
}: {
  title: string
  formula: string
  explanation?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block text-left ml-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-3.5 h-3.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center text-[10px] font-bold border border-slate-300 transition-colors"
        title="Formula & Explanation"
      >
        i
      </button>

      {open && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none">
          <p className="font-semibold text-slate-100 text-[11px] mb-1">{title}</p>
          <div className="bg-slate-800 p-1.5 rounded font-mono text-[10px] text-amber-300 mb-1 border border-slate-700">
            {formula}
          </div>
          {explanation && <p className="text-slate-300 text-[10px] leading-tight">{explanation}</p>}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
        </div>
      )}
    </div>
  )
}

// Executive KPI Metric Card
function MetricCard({
  title,
  value,
  prevValue,
  growth,
  formula,
  explanation,
  icon,
  prefix = "",
  suffix = "",
  subtitle,
}: {
  title: string
  value: string | number
  prevValue?: string | number | null
  growth?: number | null
  formula?: string
  explanation?: string
  icon?: string
  prefix?: string
  suffix?: string
  subtitle?: string
}) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between text-slate-500 mb-1.5">
          <div className="flex items-center text-xs font-medium text-slate-600">
            {icon && <span className="mr-1.5 text-sm">{icon}</span>}
            <span>{title}</span>
            {formula && <FormulaInfo title={title} formula={formula} explanation={explanation} />}
          </div>
          {growth !== undefined && <GrowthBadge value={growth} />}
        </div>

        <div className="flex items-baseline justify-between mt-1">
          <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {prefix}
            {typeof value === "number" ? value.toLocaleString() : value}
            {suffix}
          </div>
        </div>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      {prevValue !== undefined && prevValue !== null && (
        <div className="text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span>Prior Period:</span>
          <span className="font-medium text-slate-600">
            {prefix}
            {typeof prevValue === "number" ? prevValue.toLocaleString() : prevValue}
            {suffix}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN ANALYTICS DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  // Global Date Filter State
  const [range, setRange] = useState("30DAYS")
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  )
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0])

  // Active Section Tab: 0. OVERVIEW, 1. CUSTOMERS, 2. PRODUCTS, 3. INVENTORY & WASTE
  const [activeSection, setActiveSection] = useState<"overview" | "customers" | "products" | "inventory">("overview")

  // API Data State
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Search & Filter States for Action Tables
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerSegmentFilter, setCustomerSegmentFilter] = useState("ALL")
  const [customerRfmFilter, setCustomerRfmFilter] = useState("ALL")
  const [productSearch, setProductSearch] = useState("")
  const [productCategoryFilter, setProductCategoryFilter] = useState("ALL")
  const [productSortBy, setProductSortBy] = useState<"revenue" | "units" | "growth" | "margin">("revenue")
  const [inventorySearch, setInventorySearch] = useState("")
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("ALL")

  // Global Analytics Slicers / Filters (Above Analytics Content)
  const [orderType, setOrderType] = useState("ALL")
  const [categoryId, setCategoryId] = useState("ALL")
  const [itemId, setItemId] = useState("ALL")
  const [channel, setChannel] = useState("ALL")
  const [paymentMethod, setPaymentMethod] = useState("ALL")
  const [customerType, setCustomerType] = useState("ALL")

  const hasActiveFilters =
    range !== "30DAYS" ||
    orderType !== "ALL" ||
    categoryId !== "ALL" ||
    itemId !== "ALL" ||
    channel !== "ALL" ||
    paymentMethod !== "ALL" ||
    customerType !== "ALL"

  const resetGlobalFilters = () => {
    setRange("30DAYS")
    setOrderType("ALL")
    setCategoryId("ALL")
    setItemId("ALL")
    setChannel("ALL")
    setPaymentMethod("ALL")
    setCustomerType("ALL")
  }

  // Fetch unified Analytics API
  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      let url = `/api/dashboard/analytics?range=${range}`
      if (range === "CUSTOM") {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
      if (orderType !== "ALL") url += `&orderType=${encodeURIComponent(orderType)}`
      if (categoryId !== "ALL") url += `&categoryId=${encodeURIComponent(categoryId)}`
      if (itemId !== "ALL") url += `&itemId=${encodeURIComponent(itemId)}`
      if (channel !== "ALL") url += `&channel=${encodeURIComponent(channel)}`
      if (paymentMethod !== "ALL") url += `&paymentMethod=${encodeURIComponent(paymentMethod)}`
      if (customerType !== "ALL") url += `&customerType=${encodeURIComponent(customerType)}`

      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error("Failed to fetch analytics data", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [range, startDate, endDate, orderType, categoryId, itemId, channel, paymentMethod, customerType])

  // OrderDrawer Status Update Handler
  const handleStatusUpdate = async (orderId: string, newStatus: string, reason?: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      })
      if (res.ok) {
        fetchAnalytics()
      }
    } catch (err) {
      console.error("Failed to update status", err)
    }
  }

  // PDF Export
  const generatePDFReport = () => {
    if (!data) return
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.setTextColor(79, 70, 229)
    doc.text("Restaurant Business Intelligence Report", 14, 20)

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    doc.text(`Period: ${range} (${data.period?.startDate?.slice(0, 10)} to ${data.period?.endDate?.slice(0, 10)})`, 14, 31)

    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text("Owner Executive Overview", 14, 40)

    const summaryRows = [
      ["Gross Sales", `Rs. ${data.overview?.grossSales?.value?.toLocaleString() || 0}`],
      ["Net Sales", `Rs. ${data.overview?.netSales?.value?.toLocaleString() || 0}`],
      ["Total Valid Orders", `${data.overview?.totalOrders?.value || 0}`],
      ["Average Order Value (AOV)", `Rs. ${data.overview?.aov?.value?.toFixed(2) || 0}`],
      ["Active Diners", `${data.customers?.totalActiveCustomers || 0}`],
      ["New Diners", `${data.customers?.newCustomersCount || 0}`],
      ["Returning Diners", `${data.customers?.returningCustomersCount || 0}`],
      ["Repeat Customer Rate", `${data.customers?.repeatCustomerRate || 0}%`],
      ["Gross Profit (Recipe)", data.overview?.grossProfit?.value !== null ? `Rs. ${data.overview?.grossProfit?.value?.toLocaleString()}` : "Cost data unavailable"],
      ["Contribution Margin", data.overview?.contributionMargin?.value !== null ? `${data.overview?.contributionMargin?.value}%` : "Cost data unavailable"],
      ["Food Cost %", data.overview?.foodCostPercent?.value !== null ? `${data.overview?.foodCostPercent?.value}%` : "Cost data unavailable"],
      ["Current Inventory Value", `Rs. ${data.inventory?.valuation?.toLocaleString() || 0}`],
      ["Total Recorded Waste", `Rs. ${data.inventory?.wastedCost?.toLocaleString() || 0}`],
    ]

    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryRows,
      headStyles: { fillColor: [79, 70, 229] },
    })

    const finalY = (doc as any).lastAutoTable?.finalY || 110

    doc.setFontSize(12)
    doc.text("Top Selling Menu Items", 14, finalY + 12)

    const itemRows = (data.products?.topByRevenue || []).slice(0, 8).map((p: any, idx: number) => [
      idx + 1,
      p.name,
      p.categoryName,
      p.unitsSold,
      `Rs. ${p.revenue.toLocaleString()}`,
      `${p.contribution}%`,
    ])

    autoTable(doc, {
      startY: finalY + 16,
      head: [["Rank", "Item Name", "Category", "Units Sold", "Revenue", "Contribution"]],
      body: itemRows,
      headStyles: { fillColor: [16, 185, 129] },
    })

    doc.save(`Restaurant-Owner-BI-Report-${new Date().toISOString().split("T")[0]}.pdf`)
  }

  const handleExcelExport = () => {
    window.open(`/api/dashboard/export?range=${range}&format=excel`, "_blank")
  }

  // ─────────────────────────────────────────────────────────────
  // FILTERED TABLES DATA
  // ─────────────────────────────────────────────────────────────
  // Filtered Customer Action Table
  const filteredCustomerTable = useMemo(() => {
    if (!data?.customers?.customerActionTable) return []
    let list = [...data.customers.customerActionTable]
    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          c.favouriteDish?.toLowerCase().includes(q)
      )
    }
    if (customerSegmentFilter !== "ALL") {
      list = list.filter((c) => c.segment === customerSegmentFilter)
    }
    if (customerRfmFilter !== "ALL") {
      list = list.filter(
        (c) => c.rfmSegmentKey === customerRfmFilter || c.rfmSegment === customerRfmFilter
      )
    }
    return list
  }, [data, customerSearch, customerSegmentFilter, customerRfmFilter])

  // Filtered Product Action Table
  const filteredProductTable = useMemo(() => {
    if (!data?.products?.productActionTable) return []
    let list = [...data.products.productActionTable]
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
    }
    if (productCategoryFilter !== "ALL") {
      list = list.filter((p) => p.category === productCategoryFilter)
    }
    list.sort((a, b) => {
      if (productSortBy === "revenue") return b.revenue - a.revenue
      if (productSortBy === "units") return b.unitsSold - a.unitsSold
      if (productSortBy === "margin") return (b.grossMarginPercent ?? -999) - (a.grossMarginPercent ?? -999)
      if (productSortBy === "growth") return (b.repeatPurchaseRate ?? -999) - (a.repeatPurchaseRate ?? -999)
      return 0
    })
    return list
  }, [data, productSearch, productCategoryFilter, productSortBy])

  // Filtered Inventory Action Table
  const filteredInventoryTable = useMemo(() => {
    if (!data?.inventory?.inventoryActionTable) return []
    let list = [...data.inventory.inventoryActionTable]
    if (inventorySearch.trim()) {
      const q = inventorySearch.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }
    if (inventoryStatusFilter !== "ALL") {
      list = list.filter((i) => i.reorderStatus === inventoryStatusFilter)
    }
    return list
  }, [data, inventorySearch, inventoryStatusFilter])

  // Loading Screen
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-500 font-medium text-sm space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p>Crunching customer cohorts, product margins, and stock intelligence...</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // CHART DATASETS
  // ─────────────────────────────────────────────────────────────
  const customerGrowthChartData = {
    labels: data?.customers?.growthTrend?.map((t: any) => t.label) || [],
    datasets: [
      {
        label: "Active Diners",
        data: data?.customers?.growthTrend?.map((t: any) => t.activeCustomers) || [],
        borderColor: "#4F46E5",
        backgroundColor: "rgba(79, 70, 229, 0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: "First-time Diners",
        data: data?.customers?.growthTrend?.map((t: any) => t.newCustomers) || [],
        borderColor: "#10B981",
        backgroundColor: "transparent",
        borderDash: [4, 4],
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }

  const dayOfWeekChartData = {
    labels: data?.customers?.dayOfWeekStats?.map((d: any) => d.shortDay) || [],
    datasets: [
      {
        label: "Orders",
        data: data?.customers?.dayOfWeekStats?.map((d: any) => d.orders) || [],
        backgroundColor: "#6366F1",
        borderRadius: 4,
      },
      {
        label: "Revenue (₹)",
        data: data?.customers?.dayOfWeekStats?.map((d: any) => d.revenue) || [],
        backgroundColor: "#E0E7FF",
        borderRadius: 4,
        yAxisID: "y1",
      },
    ],
  }

  const hourlyChartData = {
    labels: data?.customers?.hourlyStats?.map((h: any) => h.label) || [],
    datasets: [
      {
        label: "Orders",
        data: data?.customers?.hourlyStats?.map((h: any) => h.orders) || [],
        backgroundColor: "rgba(99, 102, 241, 0.85)",
        borderColor: "#4F46E5",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const sourceChartData = {
    labels: data?.customers?.ordersBySource?.map((s: any) => s.source) || [],
    datasets: [
      {
        data: data?.customers?.ordersBySource?.map((s: any) => s.orders) || [],
        backgroundColor: ["#25D366", "#3B82F6", "#F59E0B", "#8B5CF6", "#64748B"],
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  }

  const orderTypeChartData = {
    labels: data?.customers?.ordersByOrderType?.map((t: any) => t.label) || [],
    datasets: [
      {
        data: data?.customers?.ordersByOrderType?.map((t: any) => t.orders) || [],
        backgroundColor: ["#3B82F6", "#F59E0B", "#10B981"],
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  }

  const productTrendChartData = {
    labels: data?.products?.trends?.map((t: any) => t.label) || [],
    datasets: [
      {
        label: "Food Revenue (₹)",
        data: data?.products?.trends?.map((t: any) => t.revenue) || [],
        borderColor: "#4F46E5",
        backgroundColor: "rgba(79, 70, 229, 0.08)",
        fill: true,
        tension: 0.3,
        yAxisID: "y",
      },
      {
        label: "Units Sold",
        data: data?.products?.trends?.map((t: any) => t.units) || [],
        borderColor: "#F59E0B",
        backgroundColor: "transparent",
        borderDash: [3, 3],
        tension: 0.3,
        yAxisID: "y1",
      },
    ],
  }

  const categoryChartData = {
    labels: data?.products?.categoryPerformance?.map((c: any) => c.category) || [],
    datasets: [
      {
        data: data?.products?.categoryPerformance?.map((c: any) => c.revenue) || [],
        backgroundColor: ["#4F46E5", "#10B981", "#F59E0B", "#3B82F6", "#EC4899", "#8B5CF6", "#64748B"],
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  }

  const reorderGapChartData = {
    labels: data?.customers?.reorderGapDistribution?.map((g: any) => g.bucket) || [],
    datasets: [
      {
        label: "Customers Count",
        data: data?.customers?.reorderGapDistribution?.map((g: any) => g.count) || [],
        backgroundColor: "#6366F1",
        borderRadius: 4,
      },
    ],
  }

  const wasteIngredientChartData = {
    labels: data?.inventory?.wasteByIngredient?.slice(0, 6).map((w: any) => w.name) || [],
    datasets: [
      {
        label: "Wasted Cost (₹)",
        data: data?.inventory?.wasteByIngredient?.slice(0, 6).map((w: any) => w.cost) || [],
        backgroundColor: "#EF4444",
        borderRadius: 4,
      },
    ],
  }

  const wasteReasonChartData = {
    labels: data?.inventory?.wasteByReason?.map((r: any) => r.reason) || [],
    datasets: [
      {
        data: data?.inventory?.wasteByReason?.map((r: any) => r.cost) || [],
        backgroundColor: ["#EF4444", "#F59E0B", "#3B82F6", "#64748B"],
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  }

  const inventoryTimelineData = {
    labels: data?.inventory?.consumptionTrend?.map((t: any) => t.label) || [],
    datasets: [
      {
        label: "Order Consumption Cost (₹)",
        data: data?.inventory?.consumptionTrend?.map((t: any) => t.consumedCost) || [],
        borderColor: "#10B981",
        backgroundColor: "rgba(16, 185, 129, 0.08)",
        fill: true,
        tension: 0.3,
      },
      {
        label: "Wastage Cost (₹)",
        data: data?.inventory?.consumptionTrend?.map((t: any) => t.wasteCost) || [],
        borderColor: "#EF4444",
        backgroundColor: "transparent",
        tension: 0.3,
      },
    ],
  }

  const getFilterOptionId = (opt: any): string => {
    if (!opt) return ""
    if (typeof opt === "string") return opt
    return String(opt.id ?? "")
  }

  const getFilterOptionLabel = (opt: any): string => {
    if (!opt) return ""
    if (typeof opt === "string") return opt.replace(/_/g, " ")
    const label = opt.label || opt.name || opt.id || ""
    return typeof label === "string" ? label.replace(/_/g, " ") : String(label)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & GLOBAL DATE FILTER
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📊</span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Restaurant Analytics & Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-normal mt-1">
            Executive Owner Overview, Customer Cohorts, Menu Product Margins, and Kitchen Stock Intelligence.
          </p>
        </div>

        {/* Global Range Filter Pills & Exports */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/60">
            {[
              { id: "TODAY", label: "Today" },
              { id: "7DAYS", label: "7 Days" },
              { id: "30DAYS", label: "30 Days" },
              { id: "THIS_MONTH", label: "This Month" },
              { id: "CUSTOM", label: "Custom" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  range === r.id
                    ? "bg-white text-indigo-700 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {range === "CUSTOM" && (
            <div className="flex items-center space-x-1.5 border border-slate-300 rounded-xl px-2 py-1 bg-white text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs text-slate-800 outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs text-slate-800 outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExcelExport}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>📊</span>
              <span>Excel</span>
            </button>
            <button
              onClick={generatePDFReport}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>📑</span>
              <span>PDF Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          GLOBAL ANALYTICS FILTERS & SLICERS (ABOVE ANALYTICS CONTENT)
          Layout: Date | Order Type | Category | Item | Sales Channel | Payment Method | Customer Type
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-sm">🎛️</span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Global Analytics Slicers
              </h2>
              <p className="text-[11px] text-slate-400">
                Synchronized across all Executive KPIs, Trend Charts, Action Tables, Customer Cohorts, and Inventory.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                Filters Active
              </span>
            )}
            <button
              onClick={resetGlobalFilters}
              disabled={!hasActiveFilters}
              className="text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-40 disabled:hover:text-slate-500 font-semibold transition-colors flex items-center gap-1"
            >
              <span>✕</span>
              <span>Reset All Slicers</span>
            </button>
          </div>
        </div>

        {/* Slicers Row: Date | Order Type | Category | Item | Sales Channel | Payment Method | Customer Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 items-end">
          {/* 1. Date */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>📅</span>
              <span>Date</span>
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="TODAY">Today</option>
              <option value="7DAYS">Last 7 Days</option>
              <option value="30DAYS">Last 30 Days</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </div>

          {/* 2. Order Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>🏷️</span>
              <span>Order Type</span>
            </label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Order Types</option>
              {data?.filterOptions?.orderTypes
                ?.filter((t: any) => getFilterOptionId(t) !== "ALL")
                .map((t: any, idx: number) => {
                  const val = getFilterOptionId(t)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(t)}
                    </option>
                  )
                })}
            </select>
          </div>

          {/* 3. Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>🍽️</span>
              <span>Category</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setItemId("ALL")
              }}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {data?.filterOptions?.categories
                ?.filter((c: any) => getFilterOptionId(c) !== "ALL")
                .map((c: any, idx: number) => {
                  const val = getFilterOptionId(c)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(c)}
                    </option>
                  )
                })}
            </select>
          </div>

          {/* 4. Item */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>🍲</span>
              <span>Item</span>
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Items</option>
              {(data?.filterOptions?.items || [])
                .filter(
                  (item: any) =>
                    getFilterOptionId(item) !== "ALL" &&
                    (categoryId === "ALL" || item.categoryId === categoryId)
                )
                .map((item: any, idx: number) => {
                  const val = getFilterOptionId(item)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(item)}
                    </option>
                  )
                })}
            </select>
          </div>

          {/* 5. Sales Channel */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>📱</span>
              <span>Sales Channel</span>
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Channels</option>
              {data?.filterOptions?.channels
                ?.filter((ch: any) => getFilterOptionId(ch) !== "ALL")
                .map((ch: any, idx: number) => {
                  const val = getFilterOptionId(ch)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(ch)}
                    </option>
                  )
                })}
            </select>
          </div>

          {/* 6. Payment Method */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>💳</span>
              <span>Payment Method</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Payments</option>
              {data?.filterOptions?.paymentMethods
                ?.filter((pm: any) => getFilterOptionId(pm) !== "ALL")
                .map((pm: any, idx: number) => {
                  const val = getFilterOptionId(pm)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(pm)}
                    </option>
                  )
                })}
            </select>
          </div>

          {/* 7. Customer Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>👥</span>
              <span>Customer Type</span>
            </label>
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">All Customers</option>
              {data?.filterOptions?.customerTypes
                ?.filter((ct: any) => getFilterOptionId(ct) !== "ALL")
                .map((ct: any, idx: number) => {
                  const val = getFilterOptionId(ct)
                  return (
                    <option key={val || idx} value={val}>
                      {getFilterOptionLabel(ct)}
                    </option>
                  )
                })}
            </select>
          </div>
        </div>

        {/* Custom Range Picker Drawer */}
        {range === "CUSTOM" && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600 font-semibold">Custom Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-medium text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-medium text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. OWNER ALERTS & BUSINESS INSIGHTS
          (Issue -> Cause -> Financial Impact -> Recommended Action -> Priority)
      ───────────────────────────────────────────────────────────── */}
      {data?.ownerAlerts && data.ownerAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-md border border-indigo-900/40">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🚨</span>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  Owner Alerts & Operational Insights
                </h2>
                <p className="text-[11px] text-slate-300">
                  Strictly data-backed operational observations with root causes and financial impact.
                </p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
              {data.ownerAlerts.length} Actionable Alerts
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {data.ownerAlerts.map((alert: any) => (
              <div
                key={alert.id}
                className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-400/50 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        alert.priority === "HIGH"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : alert.priority === "MEDIUM"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {alert.priority} PRIORITY
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">{alert.badge}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-white mb-2 leading-snug">
                    {alert.issue}
                  </h3>

                  <div className="space-y-1.5 text-xs">
                    <p className="text-slate-300">
                      <strong className="text-indigo-300 font-medium">Cause: </strong>
                      {alert.cause}
                    </p>
                    <p className="text-rose-200 text-[11px]">
                      <strong className="text-rose-300 font-medium">Financial Impact: </strong>
                      {alert.financialImpact}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <span>💡</span>
                    <span>{alert.recommendedAction}</span>
                  </div>
                  {alert.actionLink && (
                    <Link
                      href={alert.actionLink}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold underline shrink-0 ml-2"
                    >
                      Open →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. SECTION NAVIGATION TABS
      ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-1 sm:gap-2 overflow-x-auto">
          {[
            { id: "overview", label: "Executive Overview", icon: "📊" },
            { id: "customers", label: "Customer Analytics", icon: "👥" },
            { id: "products", label: "Product & Menu", icon: "🍽️" },
            { id: "inventory", label: "Inventory & Waste", icon: "🥫" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeSection === tab.id
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 font-medium hidden md:block">
          Comparing with prior equivalent {data?.period?.daysInPeriod || 30} days
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: OWNER EXECUTIVE OVERVIEW
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Sub-Comparison: Today vs Yesterday */}
          {data?.overview?.todayVsYesterday && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4.5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Today vs Yesterday Live Performance
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Real-time daily tracker</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Today Sales</span>
                    <GrowthBadge value={data.overview.todayVsYesterday.salesGrowth} />
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    ₹{data.overview.todayVsYesterday.todaySales.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Yesterday: ₹{data.overview.todayVsYesterday.yesterdaySales.toLocaleString()}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Today Orders</span>
                    <GrowthBadge value={data.overview.todayVsYesterday.ordersGrowth} />
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {data.overview.todayVsYesterday.todayOrders} Orders
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Yesterday: {data.overview.todayVsYesterday.yesterdayOrders} orders
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Today AOV</span>
                    <GrowthBadge value={data.overview.todayVsYesterday.aovGrowth} />
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    ₹{data.overview.todayVsYesterday.todayAov.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Yesterday: ₹{data.overview.todayVsYesterday.yesterdayAov.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Master Owner KPI Grid */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Core Performance KPIs (Selected Period)
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon="💰"
                title="Gross Sales"
                value={data?.overview?.grossSales?.value || 0}
                prevValue={data?.overview?.grossSales?.prev}
                growth={data?.overview?.grossSales?.growth}
                prefix="₹"
                formula="SUM(valid order totals including delivery & taxes)"
                explanation="Total cash inflow from all confirmed and delivered orders."
              />
              <MetricCard
                icon="🏷️"
                title="Net Sales"
                value={data?.overview?.netSales?.value || 0}
                prevValue={data?.overview?.netSales?.prev}
                growth={data?.overview?.netSales?.growth}
                prefix="₹"
                formula="SUM(valid order subtotals)"
                explanation="Pure food and beverage sales excluding delivery charges."
              />
              <MetricCard
                icon="📦"
                title="Total Orders"
                value={data?.overview?.totalOrders?.value || 0}
                prevValue={data?.overview?.totalOrders?.prev}
                growth={data?.overview?.totalOrders?.growth}
                formula="COUNT(valid orders in period)"
                explanation="Excludes cancelled or rejected orders."
              />
              <MetricCard
                icon="🎯"
                title="Average Order Value"
                value={data?.overview?.aov?.value || 0}
                prevValue={data?.overview?.aov?.prev}
                growth={data?.overview?.aov?.growth}
                prefix="₹"
                formula="Gross Sales / Valid Orders"
                explanation="Average ticket spend per customer transaction."
              />
              <MetricCard
                icon="👥"
                title="Unique Diners"
                value={data?.overview?.uniqueCustomers?.value || 0}
                prevValue={data?.overview?.uniqueCustomers?.prev}
                growth={data?.overview?.uniqueCustomers?.growth}
                formula="COUNT(DISTINCT customer_id in period)"
                explanation="Total distinct diners ordering in selected timeframe."
              />
              <MetricCard
                icon="🆕"
                title="New Diners"
                value={data?.overview?.newCustomers?.value || 0}
                formula="First order lifetime inside selected period"
                explanation="First-time diners newly acquired in this window."
              />
              <MetricCard
                icon="🔄"
                title="Repeat Customer Rate"
                value={`${data?.overview?.repeatCustomerRate?.value || 0}%`}
                subtitle={`${data?.overview?.repeatCustomers?.value || 0} returning diners`}
                formula="Returning Diners / Active Diners * 100"
                explanation="Percentage of active diners who have ordered before."
              />
              <MetricCard
                icon="📈"
                title="Gross Profit (Recipe)"
                value={data?.overview?.grossProfit?.value !== null && data?.overview?.grossProfit?.value !== undefined ? data.overview.grossProfit.value : "Cost data unavailable"}
                prevValue={data?.overview?.grossProfit?.prev}
                growth={data?.overview?.grossProfit?.growth}
                prefix={data?.overview?.grossProfit?.value !== null ? "₹" : ""}
                formula="Net Sales - SUM(Sold Units * Recipe Ingredient Costs)"
                explanation="Calculated exclusively from menu items linked to kitchen recipes."
              />
              <MetricCard
                icon="📊"
                title="Contribution Margin"
                value={data?.overview?.contributionMargin?.value !== null && data?.overview?.contributionMargin?.value !== undefined ? `${data.overview.contributionMargin.value}%` : "Cost data unavailable"}
                formula="Gross Profit / Net Sales * 100"
                explanation="Retained profit percentage after deducting ingredient costs."
              />
              <MetricCard
                icon="🥘"
                title="Food Cost % (COGS)"
                value={data?.overview?.foodCostPercent?.value !== null && data?.overview?.foodCostPercent?.value !== undefined ? `${data.overview.foodCostPercent.value}%` : "Cost data unavailable"}
                formula="Total Recipe Ingredient Cost / Net Sales * 100"
                explanation="Portion of food sales consumed by kitchen raw materials."
              />
              <MetricCard
                icon="🥫"
                title="Inventory Valuation"
                value={data?.overview?.inventoryValuation?.value || 0}
                prefix="₹"
                formula="SUM(Current Stock * Cost Per Unit)"
                explanation="Total monetary capital currently tied up in physical pantry stock."
              />
              <MetricCard
                icon="🗑️"
                title="Waste Cost & %"
                value={`₹${data?.overview?.wasteCost?.value?.toLocaleString() || 0}`}
                subtitle={`Waste Rate: ${data?.overview?.wastePercent?.value || 0}%`}
                formula="SUM(Wasted Quantity * Unit Cost)"
                explanation="Recorded spoilage, kitchen errors, and prep wastage cost."
              />
              <MetricCard
                icon="🚫"
                title="Stockout Lost Sales"
                value="N/A"
                subtitle="Logging not configured in POS"
                formula="Missed orders from 86'd items"
                explanation="No stockout transaction event is currently tracked."
              />
              <MetricCard
                icon="💬"
                title="WhatsApp Orders"
                value={data?.overview?.whatsAppOrders?.value || 0}
                prevValue={data?.overview?.whatsAppOrders?.prev}
                growth={data?.overview?.whatsAppOrders?.growth}
                subtitle={data?.overview?.whatsAppConversionRate?.value !== null ? `${data.overview.whatsAppConversionRate.value}% Cart Conversion` : "N/A"}
                formula="Orders where source = WHATSAPP"
                explanation="Orders received directly through WhatsApp catalog automation."
              />
              <MetricCard
                icon="🎯"
                title="Sales vs Target"
                value="N/A"
                subtitle="No target configured"
                formula="Actual Sales / Budgeted Target"
                explanation="Configure target in restaurant settings to enable."
              />
              <MetricCard
                icon="⚠️"
                title="Cancelled / Lost"
                value={data?.overview?.cancelledOrders?.value || 0}
                subtitle={`₹${data?.overview?.lostRevenue?.value?.toLocaleString() || 0} lost revenue`}
                formula="COUNT(CANCELLED + REJECTED orders)"
                explanation="Orders rejected by kitchen or cancelled by customer."
              />
            </div>
          </div>

          {/* Revenue & Units Timeline Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  Revenue & Volume Sales Trend
                </h3>
                <p className="text-xs text-slate-500">
                  Daily progression of customer food revenue vs volume units prepared.
                </p>
              </div>
            </div>
            <div className="h-[280px]">
              <Line
                data={productTrendChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { callback: (val) => `₹${val}` },
                    },
                    y1: {
                      position: "right",
                      beginAtZero: true,
                      grid: { drawOnChartArea: false },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Channel and Fulfillment Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Order Channels & Source
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Distribution across WhatsApp, POS In-Store, Web, and Phone orders.
              </p>
              <div className="h-[220px] flex items-center justify-center">
                <Doughnut
                  data={sourceChartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Order Fulfillment Types
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Comparison of Home Delivery, Takeaway counter pickups, and Dine-In.
              </p>
              <div className="h-[220px] flex items-center justify-center">
                <Doughnut
                  data={orderTypeChartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: CUSTOMER ANALYTICS & TIME-BASED RETENTION
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "customers" && (
        <div className="space-y-6">
          {/* Top Customer KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="👥"
              title="Active Customers"
              value={data?.customers?.totalActiveCustomers || 0}
              prevValue={data?.customers?.growth?.activeCustomers !== null ? data?.customers?.totalActiveCustomers : undefined}
              growth={data?.customers?.growth?.activeCustomers}
              formula="COUNT(DISTINCT customer_id in period)"
              explanation="Unique diners who placed at least one valid order during the date range."
            />
            <MetricCard
              icon="🔄"
              title="Repeat Rate"
              value={`${data?.customers?.repeatCustomerRate || 0}%`}
              subtitle={`${data?.customers?.returningCustomersCount || 0} returning diners`}
              formula="Returning Diners / Active Diners * 100"
              explanation="Proportion of diners who have ordered previously."
            />
            <MetricCard
              icon="⏱️"
              title="Order Frequency"
              value={`${data?.customers?.orderFrequency || 0}x`}
              formula="Valid Orders / Active Diners"
              explanation="Average number of completed orders placed per active diner."
            />
            <MetricCard
              icon="🍽️"
              title="Avg Items Per Order"
              value={data?.customers?.avgItemsPerOrder || 0}
              formula="Total Items Sold / Valid Orders"
              explanation="Average basket depth per dining party."
            />
            <MetricCard
              icon="💵"
              title="Revenue Per Diner"
              value={data?.customers?.revenuePerCustomer || 0}
              prefix="₹"
              formula="Gross Sales / Active Diners"
              explanation="Average monetary contribution per diner in this period."
            />
            <MetricCard
              icon="💎"
              title="Average Diner LTV"
              value={data?.customers?.avgCustomerLtv || 0}
              prefix="₹"
              formula="SUM(Lifetime spend of active diners) / Active Diners"
              explanation="Historical lifetime gross revenue generated by diners."
            />
            <MetricCard
              icon="⏳"
              title="Avg Reorder Gap"
              value={data?.customers?.avgReorderGapDays !== null ? `${data.customers.avgReorderGapDays} days` : "Single Order"}
              formula="Average days elapsed between consecutive orders"
              explanation="Typical cadence between repeat visits."
            />
            <MetricCard
              icon="💔"
              title="Customer Churn Rate"
              value={`${data?.customers?.churnRate || 0}%`}
              subtitle={`${data?.customers?.dormantCustomers || 0} dormant diners`}
              formula="Dormant (>90d) / Total Historical Diners * 100"
              explanation="Diners who have not reordered in more than 90 days."
            />
          </div>

          {/* Time-Based Retention & Funnel */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  Time-Based Retention & Conversion Funnel
                </h3>
                <p className="text-xs text-slate-500">
                  Measuring true cohort conversion: how quickly first-time buyers become loyal regulars.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                {data?.customers?.timeBasedRetention?.secondOrderConversionRate || 0}% 2nd Order Conversion
              </span>
            </div>

            {/* Retention Milestones Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-500 block">7-Day Repeat Rate</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                  {data?.customers?.timeBasedRetention?.repeatRate7Days || 0}%
                </span>
                <span className="text-[10px] text-slate-400">Reordered within 1 week</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-500 block">30-Day Repeat Rate</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                  {data?.customers?.timeBasedRetention?.repeatRate30Days || 0}%
                </span>
                <span className="text-[10px] text-slate-400">Reordered within 1 month</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-500 block">60-Day Repeat Rate</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                  {data?.customers?.timeBasedRetention?.repeatRate60Days || 0}%
                </span>
                <span className="text-[10px] text-slate-400">Reordered within 2 months</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-500 block">Avg Time to 2nd Order</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                  {data?.customers?.timeBasedRetention?.avgDaysFirstToSecond !== null ? `${data.customers.timeBasedRetention.avgDaysFirstToSecond} days` : "N/A"}
                </span>
                <span className="text-[10px] text-slate-400">First to second gap</span>
              </div>
            </div>

            {/* Visual Funnel Bar */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-700 block mb-2">Lifetime Ordering Funnel</span>
              <div className="space-y-2">
                {data?.customers?.orderFunnel?.map((step: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                      <span>{step.step}</span>
                      <span>
                        {step.count} Diners ({step.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, step.percent))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Customer Preference Analytics Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
              Customer Dining Preferences
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Real ordering behavior preferences extracted from kitchen sales history.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Veg vs Non-Veg</span>
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                  <span className="text-emerald-700">🌱 Veg: {data?.customers?.preferences?.vegPreference?.vegPercent}%</span>
                  <span className="text-rose-700">🍗 Non-Veg: {data?.customers?.preferences?.vegPreference?.nonVegPercent}%</span>
                </div>
                <div className="w-full bg-rose-200 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${data?.customers?.preferences?.vegPreference?.vegPercent || 50}%` }}
                  />
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${data?.customers?.preferences?.vegPreference?.nonVegPercent || 50}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Favourite Dish</span>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {data?.customers?.preferences?.favouriteDish || "N/A"}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">Most frequently ordered</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Favourite Category</span>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {data?.customers?.preferences?.favouriteCategory || "N/A"}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">Highest order volume</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Peak Dining Times</span>
                <div className="text-sm font-bold text-slate-900">
                  {data?.customers?.preferences?.preferredDay || "Weekend"}
                </div>
                <span className="text-[11px] text-indigo-600 font-medium mt-1 block truncate">
                  Peak: {data?.customers?.preferences?.peakHourText || "Evening"}
                </span>
              </div>
            </div>
          </div>

          {/* Reorder Gap Distribution & Customer Growth Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Reorder Gap Distribution
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Cadence of days between repeat orders from regular diners.
              </p>
              <div className="h-[240px]">
                <Bar
                  data={reorderGapChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Active Diners Growth Timeline
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Total daily diners vs first-time customer acquisition.
              </p>
              <div className="h-[240px]">
                <Line
                  data={customerGrowthChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Day of Week & Peak Hours */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Orders by Day of Week
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Find your slowest and busiest days to schedule prep and promotions.
              </p>
              <div className="h-[240px]">
                <Bar
                  data={dayOfWeekChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true },
                      y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
                    },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Orders by Hour of Day
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Kitchen peak rush hours (0:00 to 23:00).
              </p>
              <div className="h-[240px]">
                <Bar
                  data={hourlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Cohort Retention Table */}
          {data?.customers?.cohortRetention && data.customers.cohortRetention.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Monthly Customer Cohort Retention
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Tracking how well new diners acquired in each month return over subsequent months.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Cohort Month</th>
                      <th className="py-2.5 px-3">New Diners</th>
                      <th className="py-2.5 px-3">Month 0</th>
                      <th className="py-2.5 px-3">Month 1</th>
                      <th className="py-2.5 px-3">Month 2</th>
                      <th className="py-2.5 px-3">Month 3</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.customers.cohortRetention.map((ch: any) => (
                      <tr key={ch.cohortMonth} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-slate-900">{ch.cohortMonth}</td>
                        <td className="py-2 px-3 text-slate-700">{ch.size}</td>
                        <td className="py-2 px-3 font-medium text-emerald-600">{ch.m0}%</td>
                        <td className="py-2 px-3">
                          {ch.m1 !== null ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                              {ch.m1}%
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {ch.m2 !== null ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                              {ch.m2}%
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {ch.m3 !== null ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                              {ch.m3}%
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────
              CUSTOMER RFM SEGMENTATION (RECENCY, FREQUENCY, MONETARY)
              Scores: Recency (1-5), Frequency (1-5), Monetary (1-5) & Segments
          ───────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                    Customer RFM Segmentation (Recency, Frequency, Monetary)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Scientific customer value ranking across Recency (1-5), Frequency (1-5), and Monetary (1-5).
                  Directly powers targeted marketing campaigns in Customer Offers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/customers/offers"
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200/80 transition-all flex items-center gap-1.5"
                >
                  <span>📢</span>
                  <span>Create RFM Campaign</span>
                </Link>
              </div>
            </div>

            {/* RFM Methodology Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800">Recency (R: 1-5)</span>
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    Visits Cadence
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-snug">
                  Days elapsed since customer's last order. R5 (≤14d), R4 (15-30d), R3 (31-60d), R2 (61-90d), R1 (&gt;90d).
                </p>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-indigo-800">Frequency (F: 1-5)</span>
                  <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                    Order Volume
                  </span>
                </div>
                <p className="text-[11px] text-indigo-900 leading-snug">
                  Total completed orders placed. F5 (≥10 orders), F4 (6-9), F3 (3-5), F2 (2), F1 (1 order).
                </p>
              </div>

              <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-800">Monetary (M: 1-5)</span>
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Revenue Spend
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 leading-snug">
                  Quintile ranking of lifetime revenue spent by diner in your restaurant (M5 highest spenders).
                </p>
              </div>
            </div>

            {/* RFM Segment Distribution Grid */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  RFM Customer Segments & Targeted Actions
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {data?.customers?.rfm?.summary?.totalCustomers || 0} Total Diners Segmented
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.values(RFM_SEGMENT_DEFINITIONS).map((def) => {
                  const dist = (data?.customers?.rfm?.distribution || []).find((d: any) => d.key === def.key)
                  const count = dist?.count || 0
                  const percent = dist?.percent || 0
                  const isSelected = customerRfmFilter === def.key

                  return (
                    <div
                      key={def.key}
                      onClick={() => setCustomerRfmFilter(isSelected ? "ALL" : def.key)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "ring-2 ring-indigo-500 bg-indigo-50/40 border-indigo-300"
                          : "bg-slate-50/70 hover:bg-white hover:shadow-xs border-slate-200/80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${def.badgeBg} ${def.badgeText}`}
                          >
                            {def.label}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {count} ({percent}%)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug mb-2">
                          {def.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 text-[10px] truncate max-w-[120px]" title={def.action}>
                          💡 {def.action}
                        </span>
                        <Link
                          href={`/customers/offers?segment=RFM_${def.key}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold shrink-0"
                          title="Target segment in Customer Offers"
                        >
                          Target →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              CUSTOMER ACTION TABLE (DECISION-ORIENTED)
          ───────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  Customer Decision & Action Table
                </h3>
                <p className="text-xs text-slate-500">
                  Targeted segments, churn risk ratings, and data-backed recommended actions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search diner name or phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 w-48 sm:w-52"
                />
                <select
                  value={customerSegmentFilter}
                  onChange={(e) => setCustomerSegmentFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 text-slate-700 bg-white"
                >
                  <option value="ALL">All Segments (Legacy)</option>
                  <option value="HIGH_VALUE">High Value</option>
                  <option value="LOYAL">Loyal</option>
                  <option value="REGULAR">Regular</option>
                  <option value="NEW">New</option>
                  <option value="AT_RISK">At Risk</option>
                  <option value="CHURNED">Churned</option>
                </select>

                <select
                  value={customerRfmFilter}
                  onChange={(e) => setCustomerRfmFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-indigo-200 rounded-lg focus:outline-indigo-500 text-indigo-900 bg-indigo-50/50"
                >
                  <option value="ALL">All RFM Segments</option>
                  {Object.values(RFM_SEGMENT_DEFINITIONS).map((def) => (
                    <option key={def.key} value={def.key}>
                      {def.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Segment</th>
                    <th className="py-2.5 px-3">RFM Segment</th>
                    <th className="py-2.5 px-3">RFM Score</th>
                    <th className="py-2.5 px-3">Recency (R)</th>
                    <th className="py-2.5 px-3">Frequency (F)</th>
                    <th className="py-2.5 px-3">Monetary (M)</th>
                    <th className="py-2.5 px-3">Period Rev</th>
                    <th className="py-2.5 px-3">Orders</th>
                    <th className="py-2.5 px-3">Last Order</th>
                    <th className="py-2.5 px-3">Reorder Gap</th>
                    <th className="py-2.5 px-3">Churn Risk</th>
                    <th className="py-2.5 px-3">Suggested Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomerTable.slice(0, 20).map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-[11px] text-slate-400">{c.phone || "No phone"}</div>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.segment === "HIGH_VALUE"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : c.segment === "LOYAL"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : c.segment === "NEW"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : c.segment === "AT_RISK"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : c.segment === "CHURNED"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.segment}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            c.rfmSegmentKey && RFM_SEGMENT_DEFINITIONS[c.rfmSegmentKey as RFMSegmentKey]
                              ? `${RFM_SEGMENT_DEFINITIONS[c.rfmSegmentKey as RFMSegmentKey].badgeBg} ${RFM_SEGMENT_DEFINITIONS[c.rfmSegmentKey as RFMSegmentKey].badgeText}`
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {c.rfmSegment || "Standard"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {c.rfmScore || "---"}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          ({c.rfmAverage || 0})
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        <span className="font-medium">{c.recencyDays ?? c.daysSinceLastOrder ?? 0}d</span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded ml-1">
                          R{c.recencyScore ?? 1}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        <span className="font-medium">{c.frequencyCount ?? c.lifetimeOrders ?? 0}</span>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded ml-1">
                          F{c.frequencyScore ?? 1}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        ₹{(c.monetarySpend ?? c.lifetimeSpend ?? 0).toLocaleString()}
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded ml-1 font-normal">
                          M{c.monetaryScore ?? 1}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        ₹{c.periodRevenue.toLocaleString()}
                        <div className="text-[10px] text-slate-400 font-normal">
                          Lifetime: ₹{c.lifetimeSpend.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {c.periodOrders}
                        <div className="text-[10px] text-slate-400 font-normal">
                          Lifetime: {c.lifetimeOrders}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {c.daysSinceLastOrder === 0 ? "Today" : `${c.daysSinceLastOrder}d ago`}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{c.reorderGap}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-semibold ${
                            c.churnRisk === "HIGH"
                              ? "text-rose-600"
                              : c.churnRisk === "MEDIUM"
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {c.churnRisk}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-indigo-600 font-medium truncate max-w-[140px]" title={c.suggestedAction}>
                            {c.suggestedAction}
                          </span>
                          {c.rfmSegmentKey && (
                            <Link
                              href={`/customers/offers?segment=RFM_${c.rfmSegmentKey}`}
                              className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded border border-indigo-200 shrink-0"
                              title="Create offer targeting this customer's RFM segment"
                            >
                              Offer ↗
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomerTable.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-6 text-center text-slate-400">
                        No customers found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: PRODUCT & MENU ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "products" && (
        <div className="space-y-6">
          {/* Top Product KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="🍽️"
              title="Total Units Sold"
              value={data?.products?.totalUnitsSold || 0}
              growth={data?.products?.growth?.unitsSold}
              formula="SUM(OrderItem.quantity in period)"
              explanation="Total number of food portions prepared and served."
            />
            <MetricCard
              icon="💰"
              title="Food Revenue"
              value={data?.products?.totalRevenue || 0}
              prefix="₹"
              growth={data?.products?.growth?.revenue}
              formula="SUM(OrderItem.line_total in period)"
              explanation="Total revenue contribution from menu items."
            />
            <MetricCard
              icon="🏷️"
              title="Avg Selling Price (ASP)"
              value={data?.products?.averageSellingPrice || 0}
              prefix="₹"
              formula="Product Revenue / Units Sold"
              explanation="Average realizable price per dish portion."
            />
            <MetricCard
              icon="📦"
              title="Menu Items Active"
              value={data?.products?.performanceMatrix?.length || 0}
              formula="Count of menu items in catalog"
              explanation="Active dishes offered across all categories."
            />
          </div>

          {/* Product Performance Matrix (Sales Volume x Profit Margin) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Product Performance Matrix (Volume × Margin Quadrants)
              </h3>
              <p className="text-xs text-slate-500">
                Categorizes your dishes based on sales volume and gross recipe profitability.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-emerald-800 uppercase">⭐ Stars</span>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "STAR").length || 0} Items
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-tight">
                  High volume & high margin. Your most valuable dishes. Keep inventory stocked at all times.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-blue-800 uppercase">🐄 Cash Cows</span>
                  <span className="text-[11px] font-semibold text-blue-700">
                    {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "CASH_COW").length || 0} Items
                  </span>
                </div>
                <p className="text-[11px] text-blue-900 leading-tight">
                  High sales volume with lower margins. Volume drivers. Optimize portions slightly to expand margins.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-800 uppercase">💡 Opportunities</span>
                  <span className="text-[11px] font-semibold text-amber-700">
                    {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "PUZZLE").length || 0} Items
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 leading-tight">
                  High margin potential but lower sales. Feature as chef recommendations or bundle into combos.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase">🐕 Underperformers</span>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "DOG").length || 0} Items
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-tight">
                  Low volume & low profitability. Review dish appeal, price, or consider rotating out.
                </p>
              </div>
            </div>
          </div>

          {/* Product Revenue Trend & Category Contribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Category Revenue Share
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Revenue contribution split across menu categories.
              </p>
              <div className="h-[240px] flex items-center justify-center">
                <Doughnut
                  data={categoryChartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>

            {/* Product Pairing / Frequently Bought Together */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Frequently Ordered Together (Pairings)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Items frequently found in the same cart. Ideal for high-converting combo promotions.
              </p>
              <div className="space-y-2">
                {data?.products?.frequentlyBoughtTogether?.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🍱</span>
                      <span className="font-semibold text-slate-900">{p.pairText}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-indigo-600">{p.count} times</span>
                      <div className="text-[10px] text-slate-400">{p.pairingRate}% of orders</div>
                    </div>
                  </div>
                ))}
                {(!data?.products?.frequentlyBoughtTogether || data.products.frequentlyBoughtTogether.length === 0) && (
                  <p className="text-xs text-slate-400 py-6 text-center">No multi-item baskets recorded in this period.</p>
                )}
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              PRODUCT ACTION TABLE
          ───────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  Product Decision & Action Table
                </h3>
                <p className="text-xs text-slate-500">
                  Detailed menu breakdown with recipe margins, repeat purchase rates, and recommendations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search product name..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 w-44"
                />
                <select
                  value={productSortBy}
                  onChange={(e) => setProductSortBy(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 text-slate-700 bg-white"
                >
                  <option value="revenue">Sort by Revenue</option>
                  <option value="units">Sort by Units</option>
                  <option value="margin">Sort by Margin</option>
                  <option value="growth">Sort by Repeat Rate</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Lifecycle</th>
                    <th className="py-2.5 px-3">Units</th>
                    <th className="py-2.5 px-3">Revenue</th>
                    <th className="py-2.5 px-3">Food Cost %</th>
                    <th className="py-2.5 px-3">Gross Margin</th>
                    <th className="py-2.5 px-3">Repeat Rate</th>
                    <th className="py-2.5 px-3">Attach Rate</th>
                    <th className="py-2.5 px-3">Suggested Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProductTable.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-2 px-3 text-slate-600">{p.category}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.lifecycle === "GROWING"
                              ? "bg-emerald-50 text-emerald-700"
                              : p.lifecycle === "NEW"
                              ? "bg-blue-50 text-blue-700"
                              : p.lifecycle === "DECLINING"
                              ? "bg-rose-50 text-rose-700"
                              : p.lifecycle === "AT_RISK"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {p.lifecycle}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-medium">{p.unitsSold}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        ₹{p.revenue.toLocaleString()}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">({p.contribution}%)</span>
                      </td>
                      <td className="py-2 px-3">
                        {p.foodCostPercent !== null ? (
                          <span className="font-medium text-slate-800">{p.foodCostPercent}%</span>
                        ) : (
                          <span className="text-slate-400 italic">Cost data unavailable</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {p.grossMarginPercent !== null ? (
                          <span className="font-semibold text-emerald-600">{p.grossMarginPercent}%</span>
                        ) : (
                          <span className="text-slate-400 italic">Cost data unavailable</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{p.repeatPurchaseRate}%</td>
                      <td className="py-2 px-3 text-slate-700">{p.attachRate}%</td>
                      <td className="py-2 px-3">
                        <span className="text-indigo-600 font-medium">{p.suggestedAction}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredProductTable.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-400">
                        No menu items found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: INVENTORY & WASTE ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "inventory" && (
        <div className="space-y-6">
          {/* Top Inventory KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="🥫"
              title="Current Stock Value"
              value={data?.inventory?.valuation || 0}
              prefix="₹"
              formula="SUM(Current Stock * Cost Per Unit)"
              explanation="Total capital currently in kitchen inventory."
            />
            <MetricCard
              icon="🔄"
              title="Inventory Turnover"
              value={data?.inventory?.inventoryTurnover !== null ? `${data.inventory.inventoryTurnover}x` : "N/A"}
              formula="Period Consumption Cost / Average Inventory Value"
              explanation="Velocity of stock turnover during the selected date window."
            />
            <MetricCard
              icon="⏳"
              title="Store Stock Cover"
              value={data?.inventory?.daysOfStockCover !== null ? `${data.inventory.daysOfStockCover} days` : "N/A"}
              formula="Average Days Remaining across active ingredients"
              explanation="Store-wide average runway before replenishment is required."
            />
            <MetricCard
              icon="⚠️"
              title="Stockout Risk Count"
              value={data?.inventory?.lowStockCount + data?.inventory?.outOfStockCount || 0}
              subtitle={`${data?.inventory?.outOfStockCount || 0} Out of Stock / ${data?.inventory?.lowStockCount || 0} Low`}
              formula="Items where quantity <= minimum_stock"
              explanation="Ingredients requiring immediate vendor purchase."
            />
            <MetricCard
              icon="🚚"
              title="Stock Purchased"
              value={`₹${data?.inventory?.purchasedCost?.toLocaleString() || 0}`}
              subtitle={`${data?.inventory?.purchasedQty || 0} units bought`}
              growth={data?.inventory?.purchasedCostGrowth}
              formula="SUM(PURCHASE transaction costs)"
              explanation="Total vendor inventory restocking invoices in period."
            />
            <MetricCard
              icon="🍳"
              title="Stock Consumed"
              value={`₹${data?.inventory?.consumedCost?.toLocaleString() || 0}`}
              subtitle={`${data?.inventory?.consumedQty || 0} units deducted`}
              growth={data?.inventory?.consumedCostGrowth}
              formula="SUM(ORDER_DEDUCTION transaction costs)"
              explanation="Physical stock depleted by confirmed dining orders."
            />
            <MetricCard
              icon="🗑️"
              title="Total Waste Cost"
              value={`₹${data?.inventory?.wastedCost?.toLocaleString() || 0}`}
              subtitle={`${data?.inventory?.wastedQty || 0} units wasted (${data?.inventory?.wastePercent || 0}%)`}
              growth={data?.inventory?.wastedCostGrowth}
              formula="SUM(WASTAGE transaction costs)"
              explanation="Direct cost of spoiled, expired, or spilled ingredients."
            />
            <MetricCard
              icon="📊"
              title="Stockout Rate"
              value={`${data?.inventory?.stockoutRate || 0}%`}
              formula="Out of Stock Items / Total Items * 100"
              explanation="Percentage of catalog ingredients completely depleted."
            />
          </div>

          {/* ─────────────────────────────────────────────────────────
              INGREDIENT -> PRODUCT IMPACT ANALYSIS
          ───────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Ingredient → Menu Product Impact Analysis
              </h3>
              <p className="text-xs text-slate-500">
                Shows exactly which menu dishes will be disabled (86'd) if an ingredient stockout occurs.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Ingredient</th>
                    <th className="py-2.5 px-3">Current Stock</th>
                    <th className="py-2.5 px-3">Days Remaining</th>
                    <th className="py-2.5 px-3">Dishes Affected</th>
                    <th className="py-2.5 px-3">Servings Left</th>
                    <th className="py-2.5 px-3">Sales At Risk</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.inventory?.ingredientProductImpact?.map((item: any) => (
                    <tr key={item.ingredientId} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-semibold text-slate-900">{item.name}</td>
                      <td className="py-2 px-3 text-slate-700">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-semibold ${
                            item.daysRemaining !== null && item.daysRemaining <= 2
                              ? "text-rose-600"
                              : "text-amber-600"
                          }`}
                        >
                          {item.daysRemaining !== null ? `~${item.daysRemaining} days` : "Low stock"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-800">
                        <span className="font-semibold text-indigo-700">{item.dishesCount} dishes: </span>
                        <span className="text-slate-600">{item.dishesAffected.slice(0, 3).join(", ")}</span>
                        {item.dishesCount > 3 && <span className="text-slate-400"> +{item.dishesCount - 3} more</span>}
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-medium">~{item.servingsRemaining} portions</td>
                      <td className="py-2 px-3 font-semibold text-rose-600">
                        ₹{item.salesAtRisk.toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.reorderStatus === "OUT_OF_STOCK"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : item.reorderStatus === "CRITICAL"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {item.reorderStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!data?.inventory?.ingredientProductImpact || data.inventory.ingredientProductImpact.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No critical stockouts detected. All recipe ingredients are currently healthy!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expected vs Actual Consumption Variance Table */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Recipe Variance Analysis (Expected vs Actual Usage)
              </h3>
              <p className="text-xs text-slate-500">
                Detects kitchen over-portioning, theft leakage, or unrecorded recipe adjustments.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Ingredient</th>
                    <th className="py-2.5 px-3">Expected (Recipe)</th>
                    <th className="py-2.5 px-3">Actual (Deducted)</th>
                    <th className="py-2.5 px-3">Variance</th>
                    <th className="py-2.5 px-3">Variance %</th>
                    <th className="py-2.5 px-3">Variance Cost</th>
                    <th className="py-2.5 px-3">Observation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.inventory?.consumptionVariance?.map((v: any) => (
                    <tr key={v.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-semibold text-slate-900">{v.name}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {v.expectedQty} {v.unit}
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-medium">
                        {v.actualQty} {v.unit}
                      </td>
                      <td className="py-2 px-3 font-semibold">
                        <span className={v.variance > 0 ? "text-rose-600" : v.variance < 0 ? "text-amber-600" : "text-emerald-600"}>
                          {v.variance > 0 ? `+${v.variance}` : v.variance} {v.unit}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <GrowthBadge value={v.variancePercent} />
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        ₹{v.varianceCost?.toLocaleString() || 0}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            v.status.includes("Over-portioned")
                              ? "bg-rose-50 text-rose-700"
                              : v.status.includes("Optimal")
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!data?.inventory?.consumptionVariance || data.inventory.consumptionVariance.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No recipe deductions recorded in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Waste by Ingredient & Reason */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Highest Waste Cost by Ingredient
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Identifies which ingredients cause the highest financial loss.
              </p>
              <div className="h-[240px]">
                <Bar
                  data={wasteIngredientChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: { callback: (val) => `₹${val}` },
                      },
                    },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-1">
                Wastage Causes & Reasons
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Categorized by spoilage, prep error, expired stock, etc.
              </p>
              <div className="h-[240px] flex items-center justify-center">
                <Doughnut
                  data={wasteReasonChartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              INVENTORY ACTION TABLE
          ───────────────────────────────────────────────────────── */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  Inventory Decision & Action Table
                </h3>
                <p className="text-xs text-slate-500">
                  Stock status, reorder urgency, and concrete replenishment recommendations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search ingredient..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 w-44"
                />
                <select
                  value={inventoryStatusFilter}
                  onChange={(e) => setInventoryStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 text-slate-700 bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="LOW_STOCK">Low Stock</option>
                  <option value="HEALTHY">Healthy</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Ingredient</th>
                    <th className="py-2.5 px-3">Current Stock</th>
                    <th className="py-2.5 px-3">Days Remaining</th>
                    <th className="py-2.5 px-3">Consumption</th>
                    <th className="py-2.5 px-3">Variance</th>
                    <th className="py-2.5 px-3">Waste Cost</th>
                    <th className="py-2.5 px-3">Reorder Status</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Suggested Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventoryTable.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-semibold text-slate-900">{inv.name}</td>
                      <td className="py-2 px-3 text-slate-800 font-medium">
                        {inv.currentStock} {inv.unit}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{inv.daysRemaining}</td>
                      <td className="py-2 px-3 text-slate-700">{inv.consumption}</td>
                      <td className="py-2 px-3 text-slate-700">{inv.variance}</td>
                      <td className="py-2 px-3 text-slate-700">{inv.wasteCost}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.reorderStatus === "OUT_OF_STOCK"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : inv.reorderStatus === "CRITICAL"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : inv.reorderStatus === "LOW_STOCK"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {inv.reorderStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-semibold ${
                            inv.priority === "HIGH"
                              ? "text-rose-600"
                              : inv.priority === "MEDIUM"
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {inv.priority}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-indigo-600 font-medium">{inv.suggestedAction}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredInventoryTable.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">
                        No inventory items found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ORDER DETAILS DRAWER MODAL
      ───────────────────────────────────────────────────────────── */}
      {selectedOrderId && (
        <OrderDrawer
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  )
}
