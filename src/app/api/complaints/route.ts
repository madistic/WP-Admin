import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { z } from "zod"

const createComplaintSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(200, "Subject cannot exceed 200 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description cannot exceed 5000 characters"),
})

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const

/**
 * GET /api/complaints
 * Lists complaints for the authenticated restaurant.
 * Restaurant users only see their own complaints.
 * Optional query param: ?status=OPEN|IN_PROGRESS|RESOLVED|CLOSED
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurant_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get("status")

    const whereClause: {
      restaurant_id: string
      status?: (typeof VALID_STATUSES)[number]
    } = {
      restaurant_id: session.user.restaurant_id,
    }

    if (statusParam && VALID_STATUSES.includes(statusParam as any)) {
      whereClause.status = statusParam as (typeof VALID_STATUSES)[number]
    }

    const complaints = await prisma.complaint.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
    })

    return NextResponse.json({ complaints })
  } catch (error) {
    console.error("[GET /api/complaints] Error:", error)
    return NextResponse.json({ error: "Failed to fetch complaints" }, { status: 500 })
  }
}

/**
 * POST /api/complaints
 * Creates a new complaint for the authenticated restaurant.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurant_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createComplaintSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid complaint input" },
        { status: 400 }
      )
    }

    const complaint = await prisma.complaint.create({
      data: {
        restaurant_id: session.user.restaurant_id,
        subject: parsed.data.subject,
        description: parsed.data.description,
        status: "OPEN",
      },
    })

    return NextResponse.json({ success: true, complaint }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/complaints] Error:", error)
    return NextResponse.json({ error: "Failed to create complaint" }, { status: 500 })
  }
}
