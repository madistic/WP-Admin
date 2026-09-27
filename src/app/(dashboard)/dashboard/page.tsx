"use client"

import { useState, useEffect } from "react"
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
} from "chart.js"
import { Bar, Doughnut } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

export default function AnalyticsDashboard() {
  const [range, setRange] = useState("TODAY")
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [metricTab, setMetricTab] = useState<"revenue" | "orders">("revenue")

  const [dashboardTab, setDashboardTab] = useState<"business" | "inventory">("business")
  const [inventoryData, setInventoryData] = useState<any>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)

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
      console.error("Failed to fetch dashboard data", e)
    } finally {
      setLoading(false)
    }
  }

  const fetchInventoryAnalytics = async () => {
    try {
      setInventoryLoading(true)
      let url = `/api/inventory/analytics?range=${range}`
      if (range === "CUSTOM") {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setInventoryData(json)
      }
    } catch (e) {
      console.error("Failed to fetch inventory analytics data", e)
    } finally {
      setInventoryLoading(false)
    }
  }

  useEffect(() => {
    if (dashboardTab === "inventory") {
      fetchInventoryAnalytics()
    } else {
      fetchAnalytics()
    }
  }, [range, startDate, endDate, dashboardTab])

  useEffect(() => {
    const interval = setInterval(() => {
      if (dashboardTab === "inventory") {
        fetchInventoryAnalytics()
      } else {
        fetchAnalytics()
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [range, startDate, endDate, dashboardTab])

  const generatePDFReport = () => {
    if (!data) return
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.setTextColor(79, 70, 229)
    doc.text("Sagar Hotel - Business Analytics Report", 14, 20)

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 26)
    doc.text(`Report Range: ${range}`, 14, 31)

    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text("Executive Summary", 14, 40)

    const summaryRows = [
      ["Total Revenue", `₹${data.kpis.revenue.value.toLocaleString()}`],
      ["Total Orders", `${data.kpis.totalOrders.value}`],
      ["Average Order Value", `₹${data.kpis.aov.value.toFixed(2)}`],
      ["New Customers", `${data.kpis.newCustomers.value}`],
      ["Returning Customers", `${data.kpis.returningCustomers.value}`],
      ["Cancelled Orders", `${data.kpis.cancelledOrders.value} (${data.kpis.cancelledOrders.rate}%)`],
      ["Potential Revenue Lost", `₹${data.kpis.lostRevenue.value.toLocaleString()}`],
    ]

    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryRows,
      headStyles: { fillColor: [79, 70, 229] },
    })

    const finalY = (doc as any).lastAutoTable.finalY || 100
    doc.setFontSize(12)
    doc.text("Top Selling Menu Items", 14, finalY + 12)

    const itemRows = data.topSellingItems.map((item: any, idx: number) => [
      idx + 1,
      item.name,
      item.categoryName,
      item.unitsSold,
      `₹${item.revenue.toLocaleString()}`,
    ])

    autoTable(doc, {
      startY: finalY + 16,
      head: [["Rank", "Item Name", "Category", "Units Sold", "Revenue"]],
      body: itemRows,
      headStyles: { fillColor: [16, 185, 129] },
    })

    doc.save(`Restaurant-Analytics-Report-${new Date().toISOString().split("T")[0]}.pdf`)
  }

  const handleExcelExport = () => {
    window.open(`/api/dashboard/export?range=${range}&format=excel`, "_blank")
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-medium text-sm">
        Loading analytics & performance metrics...
      </div>
    )
  }

  const hourlyChartData = {
    labels: data?.hourlyStats?.map((h: any) => h.label) || [],
    datasets: [
      {
        label: metricTab === "revenue" ? "Revenue (₹)" : "Orders Count",
        data: data?.hourlyStats?.map((h: any) => (metricTab === "revenue" ? h.revenue : h.orders)) || [],
        backgroundColor: "rgba(99, 102, 241, 0.85)",
        borderColor: "rgb(79, 70, 229)",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const statusChartData = {
    labels: ["Delivered", "In Process", "Out for Delivery", "New", "Cancelled", "Rejected"],
    datasets: [
      {
        data: [
          data?.statusCounts?.DELIVERED || 0,
          data?.statusCounts?.IN_PROCESS || 0,
          data?.statusCounts?.OUT_FOR_DELIVERY || 0,
          data?.statusCounts?.NEW || 0,
          data?.statusCounts?.CANCELLED || 0,
          data?.statusCounts?.REJECTED || 0,
        ],
        backgroundColor: [
          "#10B981",
          "#F59E0B",
          "#3B82F6",
          "#A855F7",
          "#EF4444",
          "#64748B",
        ],
      },
    ],
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header according to Rule 4 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Understand revenue performance, order volume, peak hours, customer cohorts, and sales trends.
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-200/70 p-1 rounded-lg gap-1">
            {[
              { id: "TODAY", label: "Today" },
              { id: "YESTERDAY", label: "Yesterday" },
              { id: "7DAYS", label: "Last 7 Days" },
              { id: "30DAYS", label: "Last 30 Days" },
              { id: "THIS_MONTH", label: "This Month" },
              { id: "CUSTOM", label: "Custom" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  range === r.id
                    ? "bg-white text-indigo-700 shadow-xs font-semibold"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {range === "CUSTOM" && (
            <div className="flex items-center space-x-1.5 border border-slate-300 rounded-lg p-1 bg-white">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-normal text-slate-900 border-none outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-normal text-slate-900 border-none outline-none"
              />
            </div>
          )}

          {/* Export Actions */}
          <div className="flex items-center gap-2 ml-1">
            <button
              onClick={handleExcelExport}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            >
              📊 Excel
            </button>
            <button
              onClick={generatePDFReport}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
            >
              📄 Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs: Sales Analytics vs Inventory Analytics */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setDashboardTab("business")}
          className={`pb-2.5 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            dashboardTab === "business"
              ? "text-indigo-600 font-semibold border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>📊</span>
          <span>Sales & Operations</span>
        </button>
        <button
          onClick={() => setDashboardTab("inventory")}
          className={`pb-2.5 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            dashboardTab === "inventory"
              ? "text-indigo-600 font-semibold border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>🥫</span>
          <span>Inventory & Recipe Analytics</span>
        </button>
      </div>

      {dashboardTab === "business" ? (
        <>
          {/* 2. Live Operations Summary Ribbon */}
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xs flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-slate-400">Kitchen Status Pipeline:</span>
          <div className="flex items-center gap-2">
            <StatusBadge status="NEW" className="bg-purple-900/60 text-purple-200 border-purple-800" />
            <span className="text-xs font-semibold text-white">{data?.statusCounts?.NEW || 0}</span>

            <span className="text-slate-700 mx-1">•</span>

            <StatusBadge status="IN_PROCESS" className="bg-amber-900/60 text-amber-200 border-amber-800" />
            <span className="text-xs font-semibold text-white">{data?.statusCounts?.IN_PROCESS || 0}</span>

            <span className="text-slate-700 mx-1">•</span>

            <StatusBadge status="OUT_FOR_DELIVERY" className="bg-blue-900/60 text-blue-200 border-blue-800" />
            <span className="text-xs font-semibold text-white">{data?.statusCounts?.OUT_FOR_DELIVERY || 0}</span>
          </div>
        </div>
        <Link
          href="/orders"
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
        >
          Manage Orders Board &rarr;
        </Link>
      </div>

      {/* 3. Main KPI Cards Grid (Refined Card Architecture) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Total Revenue</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-slate-900">₹{data?.kpis?.revenue?.value?.toLocaleString()}</h3>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                data?.kpis?.revenue?.change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {data?.kpis?.revenue?.change >= 0 ? "↑ +" : "↓ "}
              {data?.kpis?.revenue?.change}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400">vs previous period</p>
        </div>

        {/* Total Orders */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Completed Orders</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-slate-900">{data?.kpis?.totalOrders?.value}</h3>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                data?.kpis?.totalOrders?.change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {data?.kpis?.totalOrders?.change >= 0 ? "↑ +" : "↓ "}
              {data?.kpis?.totalOrders?.change}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400">vs previous period</p>
        </div>

        {/* Average Order Value */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Average Order Value (AOV)</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-semibold text-slate-900">₹{data?.kpis?.aov?.value?.toFixed(0)}</h3>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                data?.kpis?.aov?.change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {data?.kpis?.aov?.change >= 0 ? "↑ +" : "↓ "}
              {data?.kpis?.aov?.change}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400">vs previous period</p>
        </div>

        {/* Customer Mix */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Active Customer Cohort</p>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm font-semibold text-emerald-700">{data?.kpis?.newCustomers?.value} New</span>
            <span className="text-sm font-semibold text-indigo-700">{data?.kpis?.returningCustomers?.value} Repeat</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Cancellation Rate: <span className="font-semibold text-rose-600">{data?.kpis?.cancelledOrders?.rate}%</span>
          </p>
        </div>
      </div>

      {/* 4. Quick Business Summary */}
      <div className="bg-slate-100/70 border border-slate-200 p-4 rounded-xl text-slate-800 text-xs space-y-1">
        <span className="text-xs font-semibold text-slate-900 block">💡 Executive Summary</span>
        <p className="text-slate-600 font-normal leading-relaxed">{data?.summaryText}</p>
      </div>

      {/* 5. Operational Insights Cards */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Smart Insights & Operational Bottlenecks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.insights?.map((ins: any, idx: number) => (
            <div
              key={idx}
              className={`p-3.5 rounded-lg border text-xs font-normal space-y-1 ${
                ins.type === "warning"
                  ? "bg-rose-50/60 border-rose-200 text-rose-950"
                  : ins.type === "success"
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                  : "bg-indigo-50/60 border-indigo-200 text-indigo-950"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">{ins.title}</span>
              </div>
              <p className="text-slate-700 leading-snug">{ins.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Peak Hours & Hourly Volume Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Peak Hours & Order Distribution</h2>
              <p className="text-xs text-slate-500 font-normal">
                Peak Ordering Time: <span className="text-indigo-600 font-semibold">{data?.peakHourText}</span>
              </p>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setMetricTab("revenue")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                  metricTab === "revenue" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600"
                }`}
              >
                Revenue (₹)
              </button>
              <button
                onClick={() => setMetricTab("orders")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                  metricTab === "orders" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600"
                }`}
              >
                Orders Count
              </button>
            </div>
          </div>
          <div className="h-60">
            <Bar data={hourlyChartData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Order Status Distribution</h2>
          <div className="h-44 flex justify-center">
            <Doughnut data={statusChartData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
            <div>Delivered: <span className="font-semibold text-emerald-600">{data?.statusCounts?.DELIVERED}</span></div>
            <div>In Process: <span className="font-semibold text-amber-600">{data?.statusCounts?.IN_PROCESS}</span></div>
            <div>New: <span className="font-semibold text-purple-600">{data?.statusCounts?.NEW}</span></div>
            <div>Cancelled: <span className="font-semibold text-rose-600">{data?.statusCounts?.CANCELLED}</span></div>
          </div>
        </div>
      </div>

      {/* 7. Menu Performance: Top Sellers & Low Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900">🏆 Top Selling Menu Items</h2>
            <span className="text-xs font-medium text-emerald-600">Highest Revenue</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data?.topSellingItems?.slice(0, 5).map((item: any, idx: number) => (
              <div key={item.id} className="py-2.5 flex justify-between items-center text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 font-semibold flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-slate-400 font-normal">{item.unitsSold} units sold</p>
                  </div>
                </div>
                <p className="font-semibold text-slate-900">₹{item.revenue.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900">📉 Low Performing Items</h2>
            <span className="text-xs font-medium text-rose-600">Review Recommended</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data?.lowSellingItems?.slice(0, 5).map((item: any) => (
              <div key={item.id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-slate-400 font-normal">{item.unitsSold} sold in selected period</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">₹{item.revenue}</p>
                  <span className="text-[10px] text-amber-600 font-medium block">Promote item</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 8. Top Customers & Revenue Leakage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">⭐ Top Spending Customers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-normal">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Customer</th>
                  <th className="py-2 font-medium">Phone</th>
                  <th className="py-2 font-medium">Orders</th>
                  <th className="py-2 font-medium">Total Spent</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.topCustomers?.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-medium text-slate-900">{c.name}</td>
                    <td className="py-2.5 text-slate-600 font-mono text-[11px]">{c.phone}</td>
                    <td className="py-2.5 text-indigo-600 font-medium">{c.ordersCount} orders</td>
                    <td className="py-2.5 text-slate-900 font-semibold">₹{c.totalSpent.toLocaleString()}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/customers/${c.id}`} className="text-indigo-600 hover:underline font-medium">
                        Customer 360 &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue Leakage Card */}
        <div className="bg-rose-50/50 border border-rose-200 p-5 rounded-xl space-y-3 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-rose-900 block">💸 Potential Revenue Lost</span>
            <h3 className="text-2xl font-semibold text-rose-900 mt-1">₹{data?.kpis?.lostRevenue?.value?.toLocaleString()}</h3>
            <p className="text-xs text-rose-800 font-normal mt-2 leading-relaxed">
              Uncollected revenue due to cancelled or rejected orders during this period.
            </p>
          </div>
          <div className="border-t border-rose-200 pt-3 text-xs font-normal space-y-1 text-rose-950">
            <div className="flex justify-between">
              <span>Cancelled Value:</span>
              <span className="font-semibold">₹{data?.kpis?.lostRevenue?.cancelledValue?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Rejected Value:</span>
              <span className="font-semibold">₹{data?.kpis?.lostRevenue?.rejectedValue?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 9. Latest Orders Table */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900">Latest Orders</h2>
          <Link href="/orders" className="text-xs font-medium text-indigo-600 hover:underline">View All Orders &rarr;</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-2">Order ID</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Time</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.recentOrders?.map((o: any) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedOrderId(o.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 font-semibold text-slate-900">{o.order_number}</td>
                  <td className="py-2.5 text-slate-800">{o.customer_name}</td>
                  <td className="py-2.5 text-slate-500 font-normal">
                    {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2.5 font-semibold text-slate-900">₹{o.total.toFixed(2)}</td>
                  <td className="py-2.5">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  ) : (
    /* ─────────────────────────────────────────────────────────────
        INVENTORY & RECIPE ANALYTICS VIEW
        ───────────────────────────────────────────────────────────── */
    <div className="space-y-6">
      {inventoryLoading ? (
        <div className="py-20 text-center text-slate-400 text-xs">
          <span className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mb-2" />
          <p>Calculating inventory metrics and ingredient consumption...</p>
        </div>
      ) : (
        <>
          {/* Inventory KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
              <p className="text-xs font-medium text-slate-500">Live Inventory Valuation</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-semibold text-emerald-700">
                  ₹{inventoryData?.summary?.total_valuation?.toLocaleString() || 0}
                </h3>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Current Stock
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Total items: {inventoryData?.summary?.total_items || 0}</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
              <p className="text-xs font-medium text-slate-500">Stock Consumed (Period)</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-semibold text-indigo-700">
                  ₹{inventoryData?.summary?.consumed_cost?.toLocaleString() || 0}
                </h3>
                <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {inventoryData?.summary?.consumed_quantity || 0} units
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Deducted from WhatsApp & POS orders</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
              <p className="text-xs font-medium text-slate-500">Wastage & Spoilage</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-semibold text-rose-600">
                  ₹{inventoryData?.summary?.wastage_cost?.toLocaleString() || 0}
                </h3>
                <span className="text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                  {inventoryData?.summary?.wastage_quantity || 0} units
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Recorded wastage entries</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
              <p className="text-xs font-medium text-slate-500">Stock Shortages Alert</p>
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-semibold text-amber-600">
                  {(inventoryData?.summary?.low_stock_count || 0) + (inventoryData?.summary?.out_of_stock_count || 0)}
                </h3>
                <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                  {inventoryData?.summary?.out_of_stock_count || 0} out of stock
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{inventoryData?.summary?.low_stock_count || 0} at reorder level</p>
            </div>
          </div>

          {/* Low Stock & Shortage Warning Box */}
          {((inventoryData?.low_stock_items?.length || 0) > 0 || (inventoryData?.out_of_stock_items?.length || 0) > 0) && (
            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                    Critical Inventory Restock Required
                  </span>
                </div>
                <Link
                  href="/inventory"
                  className="text-xs font-semibold text-amber-900 hover:text-amber-950 underline"
                >
                  Restock via Inventory &rarr;
                </Link>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {inventoryData?.out_of_stock_items?.map((item: any) => (
                  <span
                    key={item.id}
                    className="px-2.5 py-1 text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-200 rounded-lg flex items-center gap-1.5"
                  >
                    <span>🔴 {item.name}: 0 {item.unit}</span>
                    <span className="text-[10px] text-rose-700 font-normal">(Reorder: {item.reorder_level} {item.unit})</span>
                  </span>
                ))}
                {inventoryData?.low_stock_items?.map((item: any) => (
                  <span
                    key={item.id}
                    className="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 rounded-lg flex items-center gap-1.5"
                  >
                    <span>⚠️ {item.name}: {item.quantity} {item.unit}</span>
                    <span className="text-[10px] text-amber-700 font-normal">(Min: {item.minimum_stock})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Consumption by Menu Item Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">🥫 Ingredient Consumption by Menu Item</h2>
                  <p className="text-[11px] text-slate-400">Total recipe ingredients used per dish in this period</p>
                </div>
              </div>

              {!inventoryData?.consumption_by_menu_item?.length ? (
                <p className="text-xs text-slate-400 italic py-8 text-center">No consumption recorded in this period.</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                  {inventoryData.consumption_by_menu_item.map((entry: any, idx: number) => (
                    <div key={idx} className="py-3 text-xs space-y-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-slate-900">{entry.menu_item_name}</span>
                        <span className="font-semibold text-emerald-700">₹{entry.estimated_ingredient_cost}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{entry.orders_sold} orders sold</span>
                        <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                          {entry.ingredients.map((ing: any, iIdx: number) => (
                            <span key={iIdx} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                              {ing.name}: {ing.quantity} {ing.unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Consumption Trends by Date */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">📅 Daily Consumption & Purchases Trend</h2>
                  <p className="text-[11px] text-slate-400">Day by day breakdown of stock activity</p>
                </div>
              </div>

              {!inventoryData?.consumption_by_date?.length ? (
                <p className="text-xs text-slate-400 italic py-8 text-center">No date activity in this period.</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                        <th className="py-2">Date</th>
                        <th className="py-2">Consumed Qty</th>
                        <th className="py-2">Estimated Cost</th>
                        <th className="py-2">Wastage</th>
                        <th className="py-2">Purchases</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventoryData.consumption_by_date.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 font-medium text-slate-900">{row.date}</td>
                          <td className="py-2.5 text-indigo-700 font-semibold">{row.consumed_qty}</td>
                          <td className="py-2.5 font-semibold text-slate-800">₹{Math.round(row.consumed_cost)}</td>
                          <td className="py-2.5 text-rose-600">{row.wastage_qty ? `${row.wastage_qty} units` : "—"}</td>
                          <td className="py-2.5 text-emerald-700">{row.purchases_qty ? `${row.purchases_qty} units` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Recent Inventory Transactions Ledger */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">📜 Recent Inventory Transactions</h2>
                <p className="text-[11px] text-slate-400">Live ledger of order deductions, adjustments, and inward purchases</p>
              </div>
              <Link href="/inventory" className="text-xs font-medium text-indigo-600 hover:underline">
                View Full Inventory Ledger &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                    <th className="py-2">Date</th>
                    <th className="py-2">Item</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Quantity</th>
                    <th className="py-2">Reference</th>
                    <th className="py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryData?.recent_transactions?.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2 text-slate-500 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                        {new Date(tx.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 font-medium text-slate-900">{tx.item_name}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            tx.type === "ORDER_DEDUCTION"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : tx.type === "PURCHASE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : tx.type === "WASTAGE"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : tx.type === "REVERSAL"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2 font-bold text-slate-800">
                        {tx.type === "ORDER_DEDUCTION" || tx.type === "WASTAGE" ? "-" : "+"}
                        {tx.quantity} {tx.unit}
                      </td>
                      <td className="py-2 text-slate-600">
                        {tx.order_number ? `#${tx.order_number}` : tx.reason || "—"}
                      </td>
                      <td className="py-2 font-medium text-slate-800">
                        {tx.total_cost ? `₹${tx.total_cost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )}

  <OrderDrawer
    orderId={selectedOrderId}
    onClose={() => setSelectedOrderId(null)}
    onStatusUpdate={async () => {
      fetchAnalytics()
      if (dashboardTab === "inventory") fetchInventoryAnalytics()
    }}
  />
    </div>
  )
}
