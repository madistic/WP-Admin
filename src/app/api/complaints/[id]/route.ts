import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/complaints/[id]
 * Fetches a single complaint by ID.
 * Strictly verifies the complaint belongs to the authenticated restaurant.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurant_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const complaint = await prisma.complaint.findFirst({
      where: {
        id,
        restaurant_id: session.user.restaurant_id,
      },
    })

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 })
    }

    return NextResponse.json({ complaint })
  } catch (error) {
    console.error("[GET /api/complaints/[id]] Error:", error)
    return NextResponse.json({ error: "Failed to fetch complaint" }, { status: 500 })
  }
}
