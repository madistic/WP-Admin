// Client-side and server-safe printer management and single-click printing utility

export type KotPrinterConfig = {
  id: string
  name: string
  type?: "browser" | "network"
  ipAddress?: string
  paperWidth?: "79mm" | "58mm"
  categories?: string[] // empty or ["ALL"] for all items
  enabled: boolean
}

export type PrinterSettings = {
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
  kotPrinters?: KotPrinterConfig[]
}

export const defaultPrinterSettings: PrinterSettings = {
  paperWidth: "79mm",
  companyName: "",
  address: "",
  phone: "",
  gstin: "",
  fssai: "",
  showCustomer: true,
  showPhone: true,
  showOrderType: true,
  showTable: true,
  showAddress: true,
  showPayment: true,
  showNotes: true,
  footer: "Thank you for dining with us!",
  kotPrinters: [
    {
      id: "default-kot",
      name: "Main Kitchen KOT",
      type: "browser",
      paperWidth: "79mm",
      categories: ["ALL"],
      enabled: true,
    },
  ],
}

// In-flight print lock to prevent accidental duplicate print jobs
const inFlightPrints = new Set<string>()

function acquirePrintLock(lockKey: string): boolean {
  if (inFlightPrints.has(lockKey)) {
    return false
  }
  inFlightPrints.add(lockKey)
  setTimeout(() => {
    inFlightPrints.delete(lockKey)
  }, 2000)
  return true
}

export interface PrintOrderItem {
  id?: string
  menu_item_id?: string
  item_name_snapshot: string
  quantity: number
  line_total?: number
  description?: string | null
  category_name?: string | null
  category_id?: string | null
}

export interface PrintOrderData {
  id: string
  order_number: string
  created_at: string | Date
  order_type: "HOME_DELIVERY" | "TAKEAWAY" | "DINING" | string
  table_number?: string | null
  source?: string
  customer_name_snapshot?: string | null
  customer_phone_snapshot?: string | null
  delivery_address_snapshot?: string | null
  payment_method?: string
  payment_status?: string
  subtotal: number
  delivery_fee: number
  total: number
  notes?: string | null
  items: PrintOrderItem[]
}

/**
 * Generates formatted HTML for customer bill/receipt preserving exact design
 */
export function generateReceiptHtml(order: PrintOrderData, settings: PrinterSettings): string {
  const paperWidth = settings.paperWidth || "79mm"
  const typeLabel =
    order.order_type === "DINING"
      ? `🍽️ DINING${order.table_number ? ` · Table ${order.table_number}` : ""}`
      : order.order_type === "TAKEAWAY"
      ? "🥡 TAKEAWAY"
      : "🛵 HOME DELIVERY"

  const itemRows = order.items
    .map(
      (item) =>
        `<div class="row"><span>${item.quantity} x ${item.item_name_snapshot}${
          item.description ? `<small>${item.description}</small>` : ""
        }</span><span>₹${(item.line_total ?? 0).toFixed(2)}</span></div>`
    )
    .join("")

  const details = [
    settings.showCustomer !== false ? `Customer: ${order.customer_name_snapshot || "Valued Customer"}` : "",
    settings.showPhone !== false && order.customer_phone_snapshot ? `Phone: ${order.customer_phone_snapshot}` : "",
    settings.showOrderType !== false ? typeLabel : "",
    settings.showAddress !== false && order.delivery_address_snapshot ? `Address: ${order.delivery_address_snapshot}` : "",
    settings.showPayment !== false ? `Payment: ${order.payment_method || "COD"} / ${order.payment_status || "PENDING"}` : "",
    settings.showNotes !== false && order.notes ? `Note: ${order.notes}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt-${order.order_number}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 0; }
    body {
      width: ${paperWidth};
      margin: 0;
      padding: 5mm;
      font: 11px monospace;
      box-sizing: border-box;
      color: #000;
      background: #fff;
    }
    h1 { text-align: center; font-size: 16px; margin: 0 0 4px; font-weight: bold; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 7px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .row span:first-child { max-width: 70%; word-break: break-word; }
    .row small { display: block; font-size: 9px; white-space: normal; color: #444; }
    .total { font-weight: bold; font-size: 13px; }
    .footer { text-align: center; margin-top: 14px; white-space: pre-wrap; font-size: 10px; }
  </style>
</head>
<body>
  <h1>${settings.companyName || "Restaurant"}</h1>
  <div class="center">${settings.address || ""}</div>
  <div class="center">${settings.phone || ""}</div>
  ${settings.gstin ? `<div class="center">GSTIN: ${settings.gstin}</div>` : ""}
  ${settings.fssai ? `<div class="center">FSSAI: ${settings.fssai}</div>` : ""}
  <div class="line"></div>
  <div><b>Order: ${order.order_number}</b></div>
  <div>${new Date(order.created_at).toLocaleString("en-IN")}</div>
  ${details}
  <div class="line"></div>
  ${itemRows}
  <div class="line"></div>
  <div class="row"><span>Subtotal</span><span>₹${order.subtotal.toFixed(2)}</span></div>
  <div class="row"><span>Charges</span><span>₹${order.delivery_fee.toFixed(2)}</span></div>
  <div class="row total"><span>GRAND TOTAL</span><span>₹${order.total.toFixed(2)}</span></div>
  <div class="footer">${settings.footer || "Thank you!"}</div>
</body>
</html>`
}

/**
 * Generates formatted HTML for Kitchen Order Ticket (KOT)
 */
export function generateKotHtml(
  order: PrintOrderData,
  settings: PrinterSettings,
  stationName?: string,
  applicableItems?: PrintOrderItem[]
): string {
  const paperWidth = settings.paperWidth || "79mm"
  const itemsToPrint = applicableItems || order.items
  const totalItemUnits = itemsToPrint.reduce((acc, i) => acc + i.quantity, 0)

  const typeLabel =
    order.order_type === "DINING"
      ? `DINING${order.table_number ? ` · TABLE #${order.table_number}` : ""}`
      : order.order_type === "TAKEAWAY"
      ? "TAKEAWAY"
      : "DELIVERY"

  const itemRows = itemsToPrint
    .map(
      (item) => `
      <div style="margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;">
          <span>${item.quantity} x ${item.item_name_snapshot}</span>
        </div>
        ${item.description ? `<div style="font-size: 10px; font-weight: normal; margin-left: 12px; color: #222;">↳ ${item.description}</div>` : ""}
      </div>`
    )
    .join("")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>KOT-${order.order_number}${stationName ? `-${stationName}` : ""}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 0; }
    body {
      width: ${paperWidth};
      margin: 0;
      padding: 5mm;
      font: 12px monospace;
      box-sizing: border-box;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .line { border-top: 2px dashed #000; margin: 8px 0; }
    .thin-line { border-top: 1px dashed #444; margin: 6px 0; }
    .title { font-size: 17px; font-weight: bold; text-align: center; letter-spacing: 1px; }
    .station-badge {
      display: block;
      text-align: center;
      background: #000;
      color: #fff;
      font-weight: bold;
      font-size: 12px;
      padding: 3px 0;
      margin: 4px 0 6px;
      border-radius: 2px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .order-huge { font-size: 20px; font-weight: bold; text-align: center; margin: 4px 0; }
    .type-badge { font-weight: bold; font-size: 13px; text-align: center; }
  </style>
</head>
<body>
  <div class="title">KITCHEN ORDER TICKET</div>
  ${stationName ? `<div class="station-badge">STATION: ${stationName.toUpperCase()}</div>` : ""}
  <div class="order-huge">ORDER #${order.order_number}</div>
  <div class="type-badge">${typeLabel}</div>
  <div class="center" style="font-size: 10px; margin-top: 2px;">
    ${new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · ${new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
    ${order.source ? `· ${order.source}` : ""}
  </div>
  ${order.customer_name_snapshot ? `<div class="center" style="font-size: 10px;">Diner: ${order.customer_name_snapshot}</div>` : ""}
  <div class="line"></div>
  ${itemRows}
  <div class="line"></div>
  <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px;">
    <span>TOTAL ITEMS</span>
    <span>${totalItemUnits} units (${itemsToPrint.length} dishes)</span>
  </div>
  ${order.notes ? `<div class="thin-line"></div><div style="font-size: 11px; font-weight: bold;">SPECIAL INSTRUCTIONS:</div><div style="font-size: 11px;">${order.notes}</div>` : ""}
  <div class="center" style="margin-top: 12px; font-size: 10px; letter-spacing: 2px;">*** KOT DISPATCH ***</div>
</body>
</html>`
}

/**
 * Triggers an immediate single-click print using a transient hidden iframe.
 * No modals or extra preview steps required.
 */
function directPrintHtml(html: string, jobTitle = "Print Job"): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false)
      return
    }

    try {
      const iframe = document.createElement("iframe")
      iframe.style.position = "fixed"
      iframe.style.top = "-9999px"
      iframe.style.left = "-9999px"
      iframe.style.width = "0px"
      iframe.style.height = "0px"
      iframe.style.border = "none"
      iframe.title = jobTitle

      document.body.appendChild(iframe)

      const doc = iframe.contentWindow?.document || iframe.contentDocument
      if (!doc || !iframe.contentWindow) {
        document.body.removeChild(iframe)
        fallbackWindowPrint(html)
        resolve(true)
        return
      }

      doc.open()
      doc.write(html)
      doc.close()

      let cleanedUp = false
      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe)
            }
          }, 1000)
        }
      }

      iframe.contentWindow.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          cleanup()
          resolve(true)
        } catch (e) {
          console.warn("Iframe direct print threw, falling back to popup window:", e)
          fallbackWindowPrint(html)
          cleanup()
          resolve(true)
        }
      }

      // Safeguard timeout in case onload didn't fire
      setTimeout(() => {
        if (!cleanedUp) {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
          } catch {
            fallbackWindowPrint(html)
          }
          cleanup()
          resolve(true)
        }
      }, 700)
    } catch (e) {
      console.warn("Direct iframe print failed, using window popup:", e)
      fallbackWindowPrint(html)
      resolve(true)
    }
  })
}

function fallbackWindowPrint(html: string) {
  const printWindow = window.open("", "_blank", "width=420,height=700")
  if (!printWindow) return
  printWindow.document.write(
    html.replace("</body>", `<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()};</script></body>`)
  )
  printWindow.document.close()
}

/**
 * ONE-CLICK PRINT RECEIPT: Immediately prints the receipt without modals.
 */
export async function triggerOneClickReceiptPrint(
  order: PrintOrderData,
  settings?: PrinterSettings
): Promise<boolean> {
  const lockKey = `RECEIPT-${order.id}`
  if (!acquirePrintLock(lockKey)) {
    return false
  }

  const effectiveSettings = settings || (await fetchCurrentPrinterSettings())
  const html = generateReceiptHtml(order, effectiveSettings)
  return directPrintHtml(html, `Receipt ${order.order_number}`)
}

/**
 * ONE-CLICK PRINT KOT:
 * Sends the print job to ALL currently connected/configured KOT printers that are applicable.
 * If multiple KOT printers configured, prints relevant items to each applicable printer.
 * Handles unavailable/offline printers cleanly without breaking order/print flow.
 */
export async function triggerOneClickKotPrint(
  order: PrintOrderData,
  settings?: PrinterSettings
): Promise<{ success: boolean; printersCount: number; errors?: string[] }> {
  const lockKey = `KOT-${order.id}`
  if (!acquirePrintLock(lockKey)) {
    return { success: false, printersCount: 0 }
  }

  const effectiveSettings = settings || (await fetchCurrentPrinterSettings())
  const configuredKotPrinters = (effectiveSettings.kotPrinters || []).filter((p) => p.enabled)

  // If no configured printers, fallback to default single KOT print
  if (configuredKotPrinters.length === 0) {
    const html = generateKotHtml(order, effectiveSettings, "Kitchen", order.items)
    const printed = await directPrintHtml(html, `KOT ${order.order_number}`)
    return { success: printed, printersCount: 1 }
  }

  let printedCount = 0
  const errors: string[] = []

  // Print to all applicable KOT printers
  for (let idx = 0; idx < configuredKotPrinters.length; idx++) {
    const printer = configuredKotPrinters[idx]

    try {
      // Determine applicable items for this printer
      let applicableItems = order.items
      if (printer.categories && printer.categories.length > 0 && !printer.categories.includes("ALL")) {
        const allowedCats = new Set(printer.categories.map((c) => c.toLowerCase().trim()))
        applicableItems = order.items.filter((item) => {
          const catName = (item.category_name || "").toLowerCase().trim()
          const catId = (item.category_id || "").toLowerCase().trim()
          return allowedCats.has(catName) || allowedCats.has(catId)
        })
      }

      // If station has no applicable items in this order, skip quietly
      if (applicableItems.length === 0) {
        continue
      }

      const kotHtml = generateKotHtml(order, effectiveSettings, printer.name, applicableItems)

      if (printer.type === "network" && printer.ipAddress) {
        // Direct network print dispatch (with offline safety)
        try {
          await fetch("/api/printers/network-print", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ip: printer.ipAddress,
              content: kotHtml,
              orderNumber: order.order_number,
              stationName: printer.name,
            }),
          }).catch((netErr) => {
            console.warn(`[Printer] Network printer ${printer.name} (${printer.ipAddress}) offline:`, netErr)
            errors.push(`${printer.name} (network offline)`)
          })
        } catch (netErr: any) {
          console.warn(`[Printer] Network error for ${printer.name}:`, netErr.message)
          errors.push(`${printer.name} offline`)
        }
      } else {
        // Browser print
        // Stagger if printing to multiple browser targets so dialogs don't overlap
        if (idx > 0) {
          await new Promise((r) => setTimeout(r, 350))
        }
        await directPrintHtml(kotHtml, `KOT ${order.order_number} - ${printer.name}`)
      }

      printedCount++
    } catch (err: any) {
      console.error(`Error printing to KOT printer ${printer.name}:`, err)
      errors.push(`${printer.name}: ${err.message || "Failed"}`)
      // Never break flow for other printers
    }
  }

  return {
    success: printedCount > 0,
    printersCount: printedCount,
    errors: errors.length > 0 ? errors : undefined,
  }
}

/**
 * ONE-CLICK PRINT ALL:
 * Prints customer receipt AND sends KOT to all configured printers.
 */
export async function triggerOneClickPrintAll(
  order: PrintOrderData,
  settings?: PrinterSettings
): Promise<{ success: boolean; kotPrintersCount: number }> {
  const effectiveSettings = settings || (await fetchCurrentPrinterSettings())
  await triggerOneClickReceiptPrint(order, effectiveSettings)
  const kotResult = await triggerOneClickKotPrint(order, effectiveSettings)
  return { success: true, kotPrintersCount: kotResult.printersCount }
}

let cachedSettings: PrinterSettings | null = null
let cacheTimestamp = 0

/**
 * Cached fetch for restaurant printer settings to ensure instant 1-click execution
 */
export async function fetchCurrentPrinterSettings(): Promise<PrinterSettings> {
  const now = Date.now()
  if (cachedSettings && now - cacheTimestamp < 30000) {
    return cachedSettings
  }

  try {
    const res = await fetch("/api/restaurant")
    if (res.ok) {
      const data = await res.json()
      if (data?.printer_settings) {
        try {
          const parsed = JSON.parse(data.printer_settings)
          cachedSettings = {
            ...defaultPrinterSettings,
            ...parsed,
            companyName: parsed.companyName || data.name || "",
            address: parsed.address || data.address || "",
            phone: parsed.phone || data.phone || "",
          }
          cacheTimestamp = now
          return cachedSettings!
        } catch {
          // parse error
        }
      }
      cachedSettings = {
        ...defaultPrinterSettings,
        companyName: data?.name || "",
        address: data?.address || "",
        phone: data?.phone || "",
      }
      cacheTimestamp = now
      return cachedSettings!
    }
  } catch (e) {
    console.error("Failed to fetch printer settings", e)
  }

  return defaultPrinterSettings
}
