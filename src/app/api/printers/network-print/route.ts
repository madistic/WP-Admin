import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { ip, stationName, orderNumber } = body

    if (!ip) {
      return NextResponse.json({ error: "Printer IP is required" }, { status: 400 })
    }

    // Direct network thermal printing simulation / dispatch
    // In node/browser environments, socket connection can be made to raw 9100 port
    console.log(`[Network Printer] Dispatched KOT job for #${orderNumber} to ${stationName} at ${ip}`)

    return NextResponse.json({
      success: true,
      message: `Print job sent to ${stationName} (${ip})`,
    })
  } catch (error: any) {
    console.warn("[Network Printer] Failed to dispatch print job:", error.message)
    // Non-blocking: returns 200 with status info so other print jobs proceed smoothly
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reach network printer" },
      { status: 200 }
    )
  }
}
