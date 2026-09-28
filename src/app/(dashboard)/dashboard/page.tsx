"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import OrderDrawer from "@/components/OrderDrawer"
import StatusBadge from "@/components/StatusBadge"
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

// Growth indicator badge (Strictly handles null as N/A, never Infinity/100%)
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
        className="w-4 h-4 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center text-[10px] font-bold border border-slate-300 transition-colors"
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
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4.5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <div className="flex items-center text-xs font-medium text-slate-600">
          {icon && <span className="mr-1.5 text-sm">{icon}</span>}
          <span>{title}</span>
          {formula && <FormulaInfo title={title} formula={formula} explanation={explanation} />}
        </div>
        {growth !== undefined && <GrowthBadge value={growth} />}
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {prefix}
          {typeof value === "number" ? value.toLocaleString() : value}
          {suffix}
        </div>
      </div>

      {prevValue !== undefined && prevValue !== null && (
        <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
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

  // Active Section Tab (1. CUSTOMERS, 2. PRODUCTS, 3. INVENTORY & WASTE)
  const [activeSection, setActiveSection] = useState<"customers" | "products" | "inventory">("customers")

  // API Data State
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Search & Filter States for tables
  const [customerSearch, setCustomerSearch] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [productCategoryFilter, setProductCategoryFilter] = useState("ALL")
  const [productSortBy, setProductSortBy] = useState<"revenue" | "units" | "growth" | "margin">("revenue")

  // Fetch unified Analytics API
  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      let url = `/api/dashboard/analytics?range=${range}`
      if (range === "CUSTOM") {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
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
  }, [range, startDate, endDate])

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

    // Executive KPIs
    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text("Executive Performance Summary", 14, 40)

    const summaryRows = [
      ["Total Food Revenue", `Rs. ${data.kpis?.revenue?.value?.toLocaleString() || 0}`],
      ["Total Valid Orders", `${data.kpis?.totalOrders?.value || 0}`],
      ["Average Order Value (AOV)", `Rs. ${data.kpis?.aov?.value?.toFixed(2) || 0}`],
      ["Active Diners", `${data.customers?.totalActiveCustomers || 0}`],
      ["New Diners", `${data.customers?.newCustomersCount || 0}`],
      ["Returning Diners", `${data.customers?.returningCustomersCount || 0}`],
      ["Repeat Customer Rate", `${data.customers?.repeatCustomerRate || 0}%`],
      ["Total Units Sold", `${data.products?.totalUnitsSold || 0}`],
      ["Current Inventory Value", `Rs. ${data.inventory?.valuation?.toLocaleString() || 0}`],
      ["Total Recorded Waste", `Rs. ${data.inventory?.wastedCost?.toLocaleString() || 0}`],
    ]

    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryRows,
      headStyles: { fillColor: [79, 70, 229] },
    })

    const finalY = (doc as any).lastAutoTable?.finalY || 100

    // Top Selling Products
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

    doc.save(`Restaurant-BI-Report-${new Date().toISOString().split("T")[0]}.pdf`)
  }

  const handleExcelExport = () => {
    window.open(`/api/dashboard/export?range=${range}&format=excel`, "_blank")
  }

  // ─────────────────────────────────────────────────────────────
  // FILTERED PRODUCT LIST FOR TABLE
  // ─────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!data?.products?.performanceMatrix) return []
    let list = [...data.products.performanceMatrix]

    if (productSearch.trim()) {
      const q = productSearch.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
      )
    }

    if (productCategoryFilter !== "ALL") {
      list = list.filter((p) => p.categoryName === productCategoryFilter)
    }

    list.sort((a, b) => {
      if (productSortBy === "revenue") return b.revenue - a.revenue
      if (productSortBy === "units") return b.unitsSold - a.unitsSold
      if (productSortBy === "growth") return (b.growth ?? -999) - (a.growth ?? -999)
      if (productSortBy === "margin") return (b.grossMarginPercent ?? -999) - (a.grossMarginPercent ?? -999)
      return 0
    })

    return list
  }, [data, productSearch, productCategoryFilter, productSortBy])

  // Filtered Top Customers
  const filteredCustomers = useMemo(() => {
    if (!data?.customers?.topCustomers) return []
    if (!customerSearch.trim()) return data.customers.topCustomers
    const q = customerSearch.toLowerCase()
    return data.customers.topCustomers.filter(
      (c: any) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        c.segment.toLowerCase().includes(q)
    )
  }, [data, customerSearch])

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
  // CHART DATA PREPARATIONS
  // ─────────────────────────────────────────────────────────────

  // Customer Growth Trend (Line Chart)
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

  // New vs Returning Diners (Doughnut)
  const newVsReturningChartData = {
    labels: ["New Diners", "Returning Diners"],
    datasets: [
      {
        data: [
          data?.customers?.newCustomersCount || 0,
          data?.customers?.returningCustomersCount || 0,
        ],
        backgroundColor: ["#10B981", "#6366F1"],
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  }

  // Orders by Day of Week
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

  // Orders by Hour
  const hourlyChartData = {
    labels: data?.customers?.hourlyStats?.map((h: any) => h.label) || [],
    datasets: [
      {
        label: "Orders Count",
        data: data?.customers?.hourlyStats?.map((h: any) => h.orders) || [],
        backgroundColor: "rgba(99, 102, 241, 0.85)",
        borderColor: "#4F46E5",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  // Orders by Source
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

  // Orders by Order Type
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

  // Product Revenue Trend (Line)
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

  // Top Products by Revenue
  const topProductsChartData = {
    labels: data?.products?.topByRevenue?.slice(0, 7).map((p: any) => p.name) || [],
    datasets: [
      {
        label: "Revenue (₹)",
        data: data?.products?.topByRevenue?.slice(0, 7).map((p: any) => p.revenue) || [],
        backgroundColor: "#4F46E5",
        borderRadius: 4,
      },
    ],
  }

  // Category Revenue Contribution
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

  // Waste by Ingredient
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

  // Waste by Reason
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

  // Consumption Timeline
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
              Analytics & Business Intelligence
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-normal mt-1">
            Data-backed performance intelligence across Customers, Menu Products, and Inventory & Waste.
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
          2. PROMINENT BUSINESS INSIGHTS (WHAT, WHY, ACTION)
      ───────────────────────────────────────────────────────────── */}
      {data?.insights && data.insights.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5.5 shadow-md border border-indigo-900/40">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🧠</span>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  Business Insights & Recommendations
                </h2>
                <p className="text-[11px] text-slate-300">
                  Factual, automated intelligence derived from your live orders and kitchen operations.
                </p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
              {data.insights.length} Actionable Observations
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {data.insights.map((ins: any) => (
              <div
                key={ins.id}
                className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-400/50 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-200 uppercase tracking-wider">
                      {ins.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1.5 leading-snug">
                    {ins.title}
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-slate-200">
                      <strong className="text-indigo-300 font-medium">What: </strong>
                      {ins.what}
                    </p>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      <strong className="text-slate-300 font-medium">Why it matters: </strong>
                      {ins.why}
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <span>💡</span>
                    <span>{ins.action}</span>
                  </div>
                  {ins.actionLink && (
                    <Link
                      href={ins.actionLink}
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
        <div className="flex gap-2">
          {[
            { id: "customers", label: "Customer Analytics", icon: "👥" },
            { id: "products", label: "Product Analytics", icon: "🍽️" },
            { id: "inventory", label: "Inventory & Waste", icon: "🥫" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
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

        <div className="text-xs text-slate-500 font-medium hidden sm:block">
          Comparing against previous equivalent {data?.period?.daysInPeriod || 30} days
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. SECTION 1: CUSTOMER ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "customers" && (
        <div className="space-y-6">
          {/* Top Customer KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="👥"
              title="Active Customers"
              value={data?.customers?.totalActiveCustomers || 0}
              prevValue={data?.kpis?.activeCustomers?.prev}
              growth={data?.customers?.growth?.activeCustomers}
              formula="COUNT(DISTINCT customer_id in period)"
              explanation="Unique diners who placed at least one completed/valid order during the selected date range."
            />
            <MetricCard
              icon="🆕"
              title="New vs Returning"
              value={`${data?.customers?.newCustomersCount || 0} / ${data?.customers?.returningCustomersCount || 0}`}
              formula="New = first order in period; Returning = ordered previously"
              explanation="Breakdown of first-time diners acquired vs repeat diners ordering again."
            />
            <MetricCard
              icon="🔄"
              title="Repeat Customer Rate"
              value={`${data?.customers?.repeatCustomerRate || 0}%`}
              formula="(Returning Customers / Active Customers) × 100"
              explanation="Percentage of active diners in this period who have ordered before. Higher repeat rates indicate strong product satisfaction."
            />
            <MetricCard
              icon="🛡️"
              title="Retention Rate"
              value={data?.customers?.customerRetentionRate !== null ? `${data.customers.customerRetentionRate}%` : "N/A"}
              formula="(Prior Period Customers Returning / Total Prior Period Customers) × 100"
              explanation="Percentage of customers from the immediately preceding equivalent period who returned to order again in this period."
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="💳"
              title="Average Order Value"
              value={data?.customers?.aov ? `₹${Math.round(data.customers.aov)}` : "₹0"}
              prevValue={data?.kpis?.aov?.prev ? `₹${Math.round(data.kpis.aov.prev)}` : null}
              growth={data?.customers?.growth?.aov}
              formula="Valid Order Revenue / Valid Orders Count"
              explanation="The average spend per completed order across all channels."
            />
            <MetricCard
              icon="💰"
              title="Revenue Per Customer"
              value={data?.customers?.revenuePerCustomer ? `₹${Math.round(data.customers.revenuePerCustomer)}` : "₹0"}
              formula="Total Valid Revenue / Active Customers"
              explanation="Average total revenue contributed per unique diner in the selected timeframe."
            />
            <MetricCard
              icon="📦"
              title="Orders Per Customer"
              value={data?.customers?.ordersPerCustomer ? data.customers.ordersPerCustomer.toFixed(1) : "0"}
              formula="Total Valid Orders / Unique Active Customers"
              explanation="Frequency of orders placed per active diner."
            />
            <MetricCard
              icon="💎"
              title="Average Customer LTV"
              value={data?.customers?.avgCustomerLtv ? `₹${data.customers.avgCustomerLtv.toLocaleString()}` : "₹0"}
              formula="Average historical spend of active customers"
              explanation="Total cumulative valid lifetime revenue generated by active diners since their very first order."
            />
          </div>

          {/* Charts Row 1: Growth Trend + New vs Returning */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Customer Activity & Growth Trend</h3>
                  <p className="text-[11px] text-slate-500">Timeline of active and first-time diners over the selected period.</p>
                </div>
              </div>
              <div className="h-64">
                <Line
                  data={customerGrowthChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: "#F1F5F9" }, ticks: { stepSize: 1 } },
                      x: { grid: { display: false } },
                    },
                    plugins: { legend: { position: "top" } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">New vs Returning Mix</h3>
                <p className="text-[11px] text-slate-500">Customer acquisition vs retention split.</p>
                <div className="h-52 mt-2">
                  <Doughnut
                    data={newVsReturningChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: "bottom" } },
                    }}
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 text-center text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">New Diners</span>
                  <span className="font-bold text-emerald-600 text-sm">{data?.customers?.newCustomersCount || 0}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Returning Diners</span>
                  <span className="font-bold text-indigo-600 text-sm">{data?.customers?.returningCustomersCount || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row 2: Day of Week & Peak Hours */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Orders by Day of Week</h3>
                  <p className="text-[11px] text-slate-500">Identify which days bring the heaviest customer traffic and revenue.</p>
                </div>
              </div>
              <div className="h-60">
                <Bar
                  data={dayOfWeekChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: "#F1F5F9" } },
                      y1: { position: "right", beginAtZero: true, grid: { display: false } },
                      x: { grid: { display: false } },
                    },
                    plugins: { legend: { position: "top" } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Orders by Hour of Day</h3>
                  <p className="text-[11px] text-slate-500">Peak ordering windows to optimize kitchen staffing.</p>
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                  Peak: {data?.customers?.peakHourText}
                </span>
              </div>
              <div className="h-60">
                <Bar
                  data={hourlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: "#F1F5F9" } },
                      x: { grid: { display: false } },
                    },
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Row 3: Order Source & Order Type Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Orders by Channel / Source</h3>
              <p className="text-[11px] text-slate-500 mb-3">WhatsApp Bot vs POS vs Website.</p>
              <div className="h-48">
                <Doughnut
                  data={sourceChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom" } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Orders by Fulfillment Type</h3>
              <p className="text-[11px] text-slate-500 mb-3">Home Delivery vs Takeaway vs Dining.</p>
              <div className="h-48">
                <Doughnut
                  data={orderTypeChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom" } },
                  }}
                />
              </div>
            </div>

            {/* Loyalty vs Non-Loyalty Comparison */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Loyalty Program Impact</h3>
                <p className="text-[11px] text-slate-500 mb-3">Comparing diners engaged with loyalty points vs standard diners.</p>
                <div className="space-y-3 mt-2">
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-indigo-950 block">Loyalty Engaged Diners</span>
                      <span className="text-[11px] text-slate-500">
                        {data?.customers?.loyaltyComparison?.loyalty?.customers || 0} customers · {data?.customers?.loyaltyComparison?.loyalty?.orders || 0} orders
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-indigo-700 block">
                        ₹{data?.customers?.loyaltyComparison?.loyalty?.aov?.toLocaleString() || 0}
                      </span>
                      <span className="text-[10px] text-slate-400">Avg Basket</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Standard Diners</span>
                      <span className="text-[11px] text-slate-500">
                        {data?.customers?.loyaltyComparison?.nonLoyalty?.customers || 0} customers · {data?.customers?.loyaltyComparison?.nonLoyalty?.orders || 0} orders
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-700 block">
                        ₹{data?.customers?.loyaltyComparison?.nonLoyalty?.aov?.toLocaleString() || 0}
                      </span>
                      <span className="text-[10px] text-slate-400">Avg Basket</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-2">
                Diners using loyalty points order with a higher average basket size.
              </div>
            </div>
          </div>

          {/* Customer RFM Segmentation & Cohort Retention */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Segments */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">RFM Customer Segments</h3>
                <FormulaInfo
                  title="RFM Segmentation"
                  formula="Recency (days) + Frequency (orders) + Monetary (spend)"
                  explanation="Automatically groups your entire diner base by loyalty and churn risk."
                />
              </div>

              <div className="space-y-2">
                {[
                  { key: "HIGH_VALUE", label: "🌟 High Value Spenders", count: data?.customers?.segments?.HIGH_VALUE, color: "text-amber-700 bg-amber-50 border-amber-200" },
                  { key: "LOYAL", label: "💎 Loyal Diners (5+ orders)", count: data?.customers?.segments?.LOYAL, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                  { key: "REGULAR", label: "🟢 Regulars (2-4 orders)", count: data?.customers?.segments?.REGULAR, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                  { key: "NEW", label: "🆕 New Diners (1 order)", count: data?.customers?.segments?.NEW, color: "text-blue-700 bg-blue-50 border-blue-200" },
                  { key: "AT_RISK", label: "⚠️ At Risk (>30d inactive)", count: data?.customers?.segments?.AT_RISK, color: "text-rose-700 bg-rose-50 border-rose-200" },
                  { key: "CHURNED", label: "💤 Churned (>60d inactive)", count: data?.customers?.segments?.CHURNED, color: "text-slate-700 bg-slate-100 border-slate-200" },
                ].map((s) => (
                  <div
                    key={s.key}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${s.color}`}
                  >
                    <span className="font-semibold">{s.label}</span>
                    <span className="font-bold text-sm">{s.count || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Cohort Retention Table */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Customer Cohort Retention Rate</h3>
                  <p className="text-[11px] text-slate-500">Tracks how many acquired diners continue to order in subsequent months.</p>
                </div>
                <FormulaInfo
                  title="Cohort Retention"
                  formula="% of customers from acquisition month who re-ordered in Month N"
                />
              </div>

              {data?.customers?.cohortRetention && data.customers.cohortRetention.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-2 px-3">Cohort Month</th>
                        <th className="py-2 px-3">New Diners</th>
                        <th className="py-2 px-3 text-center">Month 0</th>
                        <th className="py-2 px-3 text-center">Month 1</th>
                        <th className="py-2 px-3 text-center">Month 2</th>
                        <th className="py-2 px-3 text-center">Month 3</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.customers.cohortRetention.map((c: any) => (
                        <tr key={c.cohortMonth} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{c.cohortMonth}</td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">{c.size} diners</td>
                          <td className="py-2.5 px-3 text-center font-bold text-emerald-700 bg-emerald-50/60 rounded">
                            {c.m0}%
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {c.m1 !== null ? (
                              <span className={`px-2 py-0.5 rounded font-semibold ${c.m1 >= 25 ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>
                                {c.m1}%
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {c.m2 !== null ? (
                              <span className={`px-2 py-0.5 rounded font-semibold ${c.m2 >= 20 ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>
                                {c.m2}%
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {c.m3 !== null ? (
                              <span className={`px-2 py-0.5 rounded font-semibold ${c.m3 >= 15 ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>
                                {c.m3}%
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
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Not enough historical monthly cohorts recorded yet.
                </div>
              )}
            </div>
          </div>

          {/* Top Customers Table */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Customers (Ranked by Revenue in Period)</h3>
                <p className="text-[11px] text-slate-500">Your highest spending diners and their historical relationship.</p>
              </div>
              <input
                type="text"
                placeholder="Search diner by name or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Segment</th>
                    <th className="py-2.5 px-3">Orders in Period</th>
                    <th className="py-2.5 px-3">Period Revenue</th>
                    <th className="py-2.5 px-3">Period AOV</th>
                    <th className="py-2.5 px-3">Lifetime Spend</th>
                    <th className="py-2.5 px-3">Last Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-900 block">{c.name}</span>
                        <span className="text-[11px] text-slate-400">{c.phone}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.segment === "HIGH_VALUE"
                              ? "bg-amber-100 text-amber-800"
                              : c.segment === "LOYAL"
                              ? "bg-indigo-100 text-indigo-800"
                              : c.segment === "AT_RISK"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.segment}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{c.orders} orders</td>
                      <td className="py-3 px-3 font-bold text-slate-900">₹{c.revenue.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-700">₹{c.aov}</td>
                      <td className="py-3 px-3 font-semibold text-indigo-700">₹{c.lifetimeSpend.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(c.lastOrder).toLocaleDateString("en-IN")} ({c.daysSinceLast}d ago)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. SECTION 2: PRODUCT ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "products" && (
        <div className="space-y-6">
          {/* Top Product KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="🍽️"
              title="Total Units Sold"
              value={data?.products?.totalUnitsSold || 0}
              prevValue={data?.kpis?.totalUnitsSold?.prev}
              growth={data?.products?.growth?.unitsSold}
              formula="SUM(OrderItem.quantity in period)"
              explanation="Total number of dishes, drinks, and food items prepared and served."
            />
            <MetricCard
              icon="💰"
              title="Product Food Revenue"
              value={`₹${data?.products?.totalRevenue ? data.products.totalRevenue.toLocaleString() : 0}`}
              prevValue={data?.kpis?.revenue?.prev ? `₹${data.kpis.revenue.prev.toLocaleString()}` : null}
              growth={data?.products?.growth?.revenue}
              formula="SUM(OrderItem.line_total)"
              explanation="Gross food and beverage sales before packaging and delivery charges."
            />
            <MetricCard
              icon="🏷️"
              title="Average Selling Price"
              value={`₹${data?.products?.averageSellingPrice || 0}`}
              formula="Product Revenue / Units Sold"
              explanation="The weighted average price collected per dish across the menu."
            />
            <MetricCard
              icon="📁"
              title="Top Category"
              value={data?.products?.categoryPerformance?.[0]?.category || "General"}
              suffix={` (${data?.products?.categoryPerformance?.[0]?.contribution || 0}%)`}
              formula="Category with highest revenue contribution"
              explanation="The category generating the largest portion of your overall food sales."
            />
          </div>

          {/* Product Performance Matrix (Volume × Margin) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Product Performance Matrix (Sales Volume × Margin)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Actionable menu engineering matrix dividing dishes into 4 strategic quadrants.
                </p>
              </div>
              <FormulaInfo
                title="Performance Matrix"
                formula="Volume (Units Sold) × Profit Margin (%)"
                explanation="Categorizes dishes to help restaurant owners optimize menu placement, pricing, and ingredient portions."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stars */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-900">⭐ Stars (High Volume & Margin)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-200/80 text-indigo-900 font-bold">
                      {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "STAR").length || 0} items
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-800/80 mb-3">
                    Top grossing crowd favorites with great profitability. Protect consistency.
                  </p>
                  <ul className="text-xs space-y-1 font-semibold text-slate-800">
                    {data?.products?.performanceMatrix
                      ?.filter((p: any) => p.quadrant === "STAR")
                      .slice(0, 4)
                      .map((p: any) => (
                        <li key={p.id} className="flex justify-between">
                          <span className="truncate max-w-[140px]">{p.name}</span>
                          <span className="text-indigo-700">{p.unitsSold} sold</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {/* Cash Cows */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-900">🐮 Cash Cows (High Volume, Low Margin)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 font-bold">
                      {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "CASH_COW").length || 0} items
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800/80 mb-3">
                    High volume staples. Consider portion optimization or a slight price bump.
                  </p>
                  <ul className="text-xs space-y-1 font-semibold text-slate-800">
                    {data?.products?.performanceMatrix
                      ?.filter((p: any) => p.quadrant === "CASH_COW")
                      .slice(0, 4)
                      .map((p: any) => (
                        <li key={p.id} className="flex justify-between">
                          <span className="truncate max-w-[140px]">{p.name}</span>
                          <span className="text-emerald-700">{p.unitsSold} sold</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {/* Puzzles / Opportunity */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-900">💡 Opportunity (High Margin, Low Volume)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold">
                      {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "PUZZLE").length || 0} items
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800/80 mb-3">
                    High profit potential. Feature on chef specials or pair with top sellers.
                  </p>
                  <ul className="text-xs space-y-1 font-semibold text-slate-800">
                    {data?.products?.performanceMatrix
                      ?.filter((p: any) => p.quadrant === "PUZZLE")
                      .slice(0, 4)
                      .map((p: any) => (
                        <li key={p.id} className="flex justify-between">
                          <span className="truncate max-w-[140px]">{p.name}</span>
                          <span className="text-amber-700">{p.unitsSold} sold</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {/* Underperformers */}
              <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">⚠️ Underperformers (Low Vol & Margin)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                      {data?.products?.performanceMatrix?.filter((p: any) => p.quadrant === "DOG").length || 0} items
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-3">
                    Low demand and profit. Review recipe appeal or consider rotating off menu.
                  </p>
                  <ul className="text-xs space-y-1 font-semibold text-slate-800">
                    {data?.products?.performanceMatrix
                      ?.filter((p: any) => p.quadrant === "DOG")
                      .slice(0, 4)
                      .map((p: any) => (
                        <li key={p.id} className="flex justify-between">
                          <span className="truncate max-w-[140px]">{p.name}</span>
                          <span className="text-slate-500">{p.unitsSold} sold</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row: Revenue Trend + Top Selling Products */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Product Revenue & Units Sold Trend</h3>
              <p className="text-[11px] text-slate-500 mb-4">Daily volume and gross revenue progression.</p>
              <div className="h-64">
                <Line
                  data={productTrendChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: "#F1F5F9" }, title: { display: true, text: "Revenue (₹)" } },
                      y1: { position: "right", beginAtZero: true, grid: { display: false }, title: { display: true, text: "Units" } },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Top Products by Revenue</h3>
              <p className="text-[11px] text-slate-500 mb-4">Ranked by gross sales contribution.</p>
              <div className="h-64">
                <Bar
                  data={topProductsChartData}
                  options={{
                    indexAxis: "y",
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: { beginAtZero: true, grid: { color: "#F1F5F9" } },
                      y: { grid: { display: false } },
                    },
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Category Share & Frequently Bought Together */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Category Sales Breakdown</h3>
              <p className="text-[11px] text-slate-500 mb-4">Revenue distribution across menu categories.</p>
              <div className="h-56">
                <Doughnut
                  data={categoryChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "right" } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Frequently Bought Together (Product Pairing)</h3>
                  <p className="text-[11px] text-slate-500">Top item combinations diners order together in the same basket.</p>
                </div>
                <FormulaInfo
                  title="Product Pairing"
                  formula="Count of distinct orders containing both Item A and Item B"
                />
              </div>

              {data?.products?.frequentlyBoughtTogether && data.products.frequentlyBoughtTogether.length > 0 ? (
                <div className="space-y-2.5">
                  {data.products.frequentlyBoughtTogether.map((pair: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800">{pair.pairText}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-indigo-600 block">{pair.count} orders</span>
                        <span className="text-[10px] text-slate-400">{pair.pairingRate}% of orders</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No multi-item orders recorded in this date range.
                </div>
              )}
            </div>
          </div>

          {/* Product Performance Deep-Dive Table */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Comprehensive Product Performance Table</h3>
                <p className="text-[11px] text-slate-500">Every menu item with sales velocity, contribution, and margins.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter product..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <select
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none bg-white text-slate-700"
                >
                  <option value="ALL">All Categories</option>
                  {data?.products?.categoryPerformance?.map((c: any) => (
                    <option key={c.category} value={c.category}>
                      {c.category}
                    </option>
                  ))}
                </select>
                <select
                  value={productSortBy}
                  onChange={(e) => setProductSortBy(e.target.value as any)}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none bg-white text-slate-700"
                >
                  <option value="revenue">Sort by Revenue</option>
                  <option value="units">Sort by Units</option>
                  <option value="growth">Sort by Growth</option>
                  <option value="margin">Sort by Margin</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Units Sold</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">ASP</th>
                    <th className="py-2.5 px-3 text-right">Contribution</th>
                    <th className="py-2.5 px-3 text-right">Growth %</th>
                    <th className="py-2.5 px-3 text-right">Gross Margin</th>
                    <th className="py-2.5 px-3">Matrix Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-3 px-3 text-slate-600">{p.categoryName}</td>
                      <td className="py-3 px-3 text-right font-medium text-slate-800">{p.unitsSold}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">₹{p.revenue.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-slate-600">₹{p.asp}</td>
                      <td className="py-3 px-3 text-right font-medium text-slate-700">{p.contribution}%</td>
                      <td className="py-3 px-3 text-right">
                        <GrowthBadge value={p.growth} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        {p.grossMarginPercent !== null ? (
                          <span className={`font-semibold ${p.grossMarginPercent >= 60 ? "text-emerald-600" : "text-amber-600"}`}>
                            {p.grossMarginPercent}%
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">N/A (No recipe)</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.quadrant === "STAR"
                              ? "bg-indigo-100 text-indigo-800"
                              : p.quadrant === "CASH_COW"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.quadrant === "PUZZLE"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {p.quadrantLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. SECTION 3: INVENTORY & WASTE ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === "inventory" && (
        <div className="space-y-6">
          {/* Top Inventory KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon="🥫"
              title="Inventory Valuation"
              value={`₹${data?.inventory?.valuation ? data.inventory.valuation.toLocaleString() : 0}`}
              formula="Σ(Current Quantity × Cost Per Unit)"
              explanation="Total asset value of raw ingredients and stock currently in storage."
            />
            <MetricCard
              icon="📦"
              title="Stock Consumed"
              value={`₹${data?.inventory?.consumedCost ? data.inventory.consumedCost.toLocaleString() : 0}`}
              growth={data?.inventory?.consumedCostGrowth}
              formula="ORDER_DEDUCTION ledger cost"
              explanation="Total cost of ingredients deducted to fulfill customer orders in this period."
            />
            <MetricCard
              icon="🛒"
              title="Stock Purchased"
              value={`₹${data?.inventory?.purchasedCost ? data.inventory.purchasedCost.toLocaleString() : 0}`}
              growth={data?.inventory?.purchasedCostGrowth}
              formula="PURCHASE transactions in period"
              explanation="Total spending on inventory replenishment during this timeframe."
            />
            <MetricCard
              icon="🗑️"
              title="Wasted Stock Cost"
              value={`₹${data?.inventory?.wastedCost ? data.inventory.wastedCost.toLocaleString() : 0}`}
              suffix={` (${data?.inventory?.wastePercent || 0}% rate)`}
              growth={data?.inventory?.wastedCostGrowth}
              formula="WASTAGE transactions cost"
              explanation="Financial loss due to spoiled, damaged, or discarded stock."
            />
          </div>

          {/* Expected vs Actual Consumption Table (Over-portioning / Leakage Detection) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Expected vs Actual Recipe Consumption (Portioning Variance)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Compares recipe theoretical requirements against actual inventory deductions to detect over-portioning or shrinkage.
                </p>
              </div>
              <FormulaInfo
                title="Consumption Variance"
                formula="Variance = Actual Deduction - Expected Recipe Consumption"
                explanation="Positive variance indicates kitchen over-portioning or unrecorded loss. Negative variance indicates dishes prepared with fewer ingredients than specified."
              />
            </div>

            {data?.inventory?.consumptionVariance && data.inventory.consumptionVariance.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                      <th className="py-2.5 px-3">Ingredient</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3 text-right">Expected (Recipe)</th>
                      <th className="py-2.5 px-3 text-right">Actual Consumed</th>
                      <th className="py-2.5 px-3 text-right">Variance Qty</th>
                      <th className="py-2.5 px-3 text-right">Variance %</th>
                      <th className="py-2.5 px-3">Portioning Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.inventory.consumptionVariance.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-semibold text-slate-900">{c.name}</td>
                        <td className="py-3 px-3 text-slate-600">{c.unit}</td>
                        <td className="py-3 px-3 text-right font-medium text-slate-700">
                          {c.expectedQty} {c.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {c.actualQty} {c.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold">
                          <span className={c.variance > 0 ? "text-rose-600" : c.variance < 0 ? "text-amber-600" : "text-emerald-600"}>
                            {c.variance > 0 ? `+${c.variance}` : c.variance} {c.unit}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {c.variancePercent !== null ? (
                            <span className={c.variancePercent > 5 ? "font-bold text-rose-600" : "text-slate-700 font-medium"}>
                              {c.variancePercent > 0 ? `+${c.variancePercent}%` : `${c.variancePercent}%`}
                            </span>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              c.status === "Optimal"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.status.includes("Over")
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No recipe ingredients linked to items sold in this period.
              </div>
            )}
          </div>

          {/* Charts Row: Consumption Timeline + Waste Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Stock Consumption & Waste Timeline</h3>
              <p className="text-[11px] text-slate-500 mb-4">Daily inventory usage value vs wastage cost.</p>
              <div className="h-64">
                <Line
                  data={inventoryTimelineData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: "#F1F5F9" } },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Waste by Ingredient</h3>
              <p className="text-[11px] text-slate-500 mb-4">Highest wasted raw stock by financial loss.</p>
              <div className="h-64">
                {data?.inventory?.wasteByIngredient?.length > 0 ? (
                  <Bar
                    data={wasteIngredientChartData}
                    options={{
                      indexAxis: "y",
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: { beginAtZero: true, grid: { color: "#F1F5F9" } },
                        y: { grid: { display: false } },
                      },
                      plugins: { legend: { display: false } },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No wastage recorded in this period.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reorder Analysis & Approaching Stockout */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Stock Run-Rate & Reorder Urgency Analysis
                </h3>
                <p className="text-[11px] text-slate-500">
                  Estimated days of stock remaining based on recent daily run-rate consumption.
                </p>
              </div>
              <FormulaInfo
                title="Days Remaining"
                formula="Current Stock / Average Daily Consumption in Period"
                explanation="Calculates how many days before an ingredient runs out completely if current ordering velocity continues."
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                    <th className="py-2.5 px-3">Ingredient</th>
                    <th className="py-2.5 px-3 text-right">Current Stock</th>
                    <th className="py-2.5 px-3 text-right">Min Stock Target</th>
                    <th className="py-2.5 px-3 text-right">Reorder Threshold</th>
                    <th className="py-2.5 px-3 text-right">Avg Daily Usage</th>
                    <th className="py-2.5 px-3 text-right">Days Remaining</th>
                    <th className="py-2.5 px-3 text-right">Suggested Reorder</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.inventory?.reorderAnalysis?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-semibold text-slate-900">{item.name}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {item.minimumStock} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {item.reorderLevel} {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {item.avgDailyConsumption} {item.unit}/day
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        {item.daysRemaining !== null ? (
                          <span
                            className={
                              item.daysRemaining <= 3
                                ? "text-rose-600 bg-rose-50 px-2 py-0.5 rounded"
                                : item.daysRemaining <= 7
                                ? "text-amber-600 bg-amber-50 px-2 py-0.5 rounded"
                                : "text-emerald-700"
                            }
                          >
                            ~{item.daysRemaining} days
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">N/A (No usage)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-indigo-700">
                        {item.suggestedReorder > 0 ? `${item.suggestedReorder} ${item.unit}` : "-"}
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          href="/inventory"
                          className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors inline-block"
                        >
                          Manage Stock →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. RECENT ORDERS QUICK ACCESS (ORDER DRAWER INTEGRATION)
      ───────────────────────────────────────────────────────────── */}
      {data?.recentOrders && data.recentOrders.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Completed / Live Orders</h3>
              <p className="text-[11px] text-slate-500">Click any order to inspect details in the drawer.</p>
            </div>
            <Link href="/orders" className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              View All Orders →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentOrders.map((o: any) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-bold text-indigo-700">#{o.order_number}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">{o.customer_name}</td>
                    <td className="py-3 px-3 text-slate-600">{o.payment_method}</td>
                    <td className="py-3 px-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">₹{o.total.toFixed(2)}</td>
                    <td className="py-3 px-3 text-slate-400">
                      {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Drawer Modal */}
      <OrderDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onStatusUpdate={async () => {
          await fetchAnalytics()
        }}
      />
    </div>
  )
}
