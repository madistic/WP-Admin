import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/branches - List all branches for the restaurant
 * Super Admin: all branches
 * Branch Admin/Staff: only their branch
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { restaurant_id, role, branch_id } = session.user as any

  // Branch-scoped users only see their own branch
  if (role !== "SUPER_ADMIN" && branch_id) {
    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, restaurant_id },
    })
    return NextResponse.json({ branches: branch ? [branch] : [] })
  }

  const branches = await prisma.branch.findMany({
    where: { restaurant_id },
    orderBy: { created_at: "asc" },
  })

  return NextResponse.json({ branches })
}

/**
 * POST /api/branches - Create a new branch (Super Admin only)
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { restaurant_id, role } = session.user as any
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Only Super Admin can create branches" }, { status: 403 })
  }

  const body = await request.json()
  const {
    name,
    code,
    address,
    phone,
    email,
    latitude,
    longitude,
    delivery_enabled,
    delivery_free_distance_km,
    delivery_extra_charge_per_km,
    delivery_charge_rounding,
    delivery_max_distance_km,
    is_active,
  } = body

  if (!name || !code) {
    return NextResponse.json({ error: "Branch name and code are required" }, { status: 400 })
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        restaurant_id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        delivery_enabled: delivery_enabled !== false,
        delivery_free_distance_km: delivery_free_distance_km ? parseFloat(delivery_free_distance_km) : 1.5,
        delivery_extra_charge_per_km: delivery_extra_charge_per_km ? parseFloat(delivery_extra_charge_per_km) : 10,
        delivery_charge_rounding: delivery_charge_rounding || "PER_STARTED_KM",
        delivery_max_distance_km: delivery_max_distance_km ? parseFloat(delivery_max_distance_km) : null,
        is_active: is_active !== false,
      },
    })

    return NextResponse.json({ branch }, { status: 201 })
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A branch with this code already exists" }, { status: 409 })
    }
    console.error("[POST /api/branches]", error)
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 })
  }
}
