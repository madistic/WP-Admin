import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCustomersForCampaign } from "@/lib/crm"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const segment = searchParams.get("segment") as any

    const customers = await getCustomersForCampaign(session.user.restaurant_id, {
      segment: segment || "ALL"
    })

    return NextResponse.json(customers)
  } catch (error: any) {
    console.error("Fetch Customers Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
