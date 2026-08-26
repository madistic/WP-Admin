import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import ExcelJS from "exceljs"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurantId = session.user.restaurant_id
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "TODAY"
    const format = searchParams.get("format") || "excel" // excel

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    })

    const orders = await prisma.order.findMany({
      where: { restaurant_id: restaurantId },
      include: {
        items: true,
        customer: true,
      },
      orderBy: { created_at: "desc" },
    })

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = restaurant?.name || "Restaurant Management"
      workbook.created = new Date()

      // Sheet 1: Executive Summary
      const summarySheet = workbook.addWorksheet("Summary")
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 30 },
        { header: "Value", key: "value", width: 25 },
      ]
      
      const totalRev = orders.filter(o => o.status !== "CANCELLED" && o.status !== "REJECTED").reduce((a, c) => a + c.total, 0)
      const validOrders = orders.filter(o => o.status !== "CANCELLED" && o.status !== "REJECTED").length

      summarySheet.addRows([
        { metric: "Restaurant Name", value: restaurant?.name || "Sagar Hotel" },
        { metric: "Report Generated Date", value: new Date().toLocaleString() },
        { metric: "Selected Range", value: range },
        { metric: "Total Orders", value: orders.length },
        { metric: "Completed/Valid Orders", value: validOrders },
        { metric: "Total Revenue (₹)", value: totalRev },
        { metric: "Average Order Value (₹)", value: validOrders > 0 ? (totalRev / validOrders).toFixed(2) : 0 },
        { metric: "Cancelled Orders", value: orders.filter(o => o.status === "CANCELLED").length },
      ])

      // Sheet 2: Detailed Orders
      const ordersSheet = workbook.addWorksheet("Orders")
      ordersSheet.columns = [
        { header: "Order Number", key: "order_number", width: 18 },
        { header: "Date & Time", key: "created_at", width: 22 },
        { header: "Customer Name", key: "customer_name", width: 22 },
        { header: "Phone", key: "phone", width: 18 },
        { header: "Address", key: "address", width: 35 },
        { header: "Payment Method", key: "payment_method", width: 16 },
        { header: "Status", key: "status", width: 16 },
        { header: "Total Amount (₹)", key: "total", width: 18 },
      ]

      orders.forEach((o) => {
        ordersSheet.addRow({
          order_number: o.order_number,
          created_at: new Date(o.created_at).toLocaleString(),
          customer_name: o.customer_name_snapshot,
          phone: o.customer_phone_snapshot,
          address: o.delivery_address_snapshot,
          payment_method: o.payment_method,
          status: o.status,
          total: o.total,
        })
      })

      // Sheet 3: Order Items
      const itemsSheet = workbook.addWorksheet("Order Items")
      itemsSheet.columns = [
        { header: "Order Number", key: "order_number", width: 18 },
        { header: "Item Name", key: "item_name", width: 30 },
        { header: "Quantity", key: "quantity", width: 12 },
        { header: "Unit Price (₹)", key: "price", width: 15 },
        { header: "Line Total (₹)", key: "line_total", width: 15 },
      ]

      orders.forEach((o) => {
        o.items.forEach((item) => {
          itemsSheet.addRow({
            order_number: o.order_number,
            item_name: item.item_name_snapshot,
            quantity: item.quantity,
            price: item.unit_price_snapshot,
            line_total: item.line_total,
          })
        })
      })

      // Style Headers
      ;[summarySheet, ordersSheet, itemsSheet].forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } }
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4F46E5" }, // Indigo
        }
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const filename = `${restaurant?.name?.replace(/[^a-zA-Z0-9]/g, "-") || "Restaurant"}-Report-${new Date().toISOString().split("T")[0]}.xlsx`

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 })
  } catch (error: any) {
    console.error("Report Export Error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
