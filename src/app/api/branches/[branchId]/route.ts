import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

function canAccessBranch(role: string, userBranchId: string | null, targetBranchId: string): boolean {
  if (role === "SUPER_ADMIN") return true
  return userBranchId === targetBranchId
}

/**
 * GET /api/branches/[branchId] - Get branch details
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { restaurant_id, role, branch_id } = session.user as any
  const { branchId } = await params

  if (!canAccessBranch(role, branch_id, branchId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, restaurant_id },
    include: {
      _count: { select: { orders: true, customers: true } },
    },
  })

  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })

  return NextResponse.json({ branch })
}

/**
 * PATCH /api/branches/[branchId] - Update branch
 * Super Admin: all fields
 * Branch Admin: limited fields (no is_active)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { restaurant_id, role, branch_id } = session.user as any
  const { branchId } = await params

  if (!canAccessBranch(role, branch_id, branchId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const branch = await prisma.branch.findFirst({ where: { id: branchId, restaurant_id } })
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })

  const body = await request.json()
  const updateData: Record<string, unknown> = {}

  // Fields accessible by Branch Admin and Super Admin
  if (body.delivery_enabled !== undefined) updateData.delivery_enabled = Boolean(body.delivery_enabled)
  if (body.delivery_free_distance_km !== undefined) updateData.delivery_free_distance_km = parseFloat(body.delivery_free_distance_km)
  if (body.delivery_extra_charge_per_km !== undefined) updateData.delivery_extra_charge_per_km = parseFloat(body.delivery_extra_charge_per_km)
  if (body.delivery_charge_rounding !== undefined) updateData.delivery_charge_rounding = body.delivery_charge_rounding
  if (body.delivery_max_distance_km !== undefined) updateData.delivery_max_distance_km = body.delivery_max_distance_km ? parseFloat(body.delivery_max_distance_km) : null

  // Super Admin only fields
  if (role === "SUPER_ADMIN") {
    if (body.name !== undefined) updateData.name = String(body.name).trim()
    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase()
    if (body.address !== undefined) updateData.address = body.address ? String(body.address).trim() : null
    if (body.phone !== undefined) updateData.phone = body.phone ? String(body.phone).trim() : null
    if (body.email !== undefined) updateData.email = body.email ? String(body.email).trim() : null
    if (body.latitude !== undefined) updateData.latitude = body.latitude ? parseFloat(body.latitude) : null
    if (body.longitude !== undefined) updateData.longitude = body.longitude ? parseFloat(body.longitude) : null
    if (body.is_active !== undefined) updateData.is_active = Boolean(body.is_active)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  try {
    const updated = await prisma.branch.update({
      where: { id: branchId },
      data: updateData,
    })
    return NextResponse.json({ branch: updated })
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Branch code already in use" }, { status: 409 })
    }
    console.error("[PATCH /api/branches/[branchId]]", error)
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 })
  }
}

/**
 * DELETE /api/branches/[branchId] - Deactivate (soft-delete) branch (Super Admin only)
 * We don't hard-delete branches as that would cascade-delete orders/customers.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { restaurant_id, role } = session.user as any
  const { branchId } = await params

  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Only Super Admin can deactivate branches" }, { status: 403 })
  }

  const branch = await prisma.branch.findFirst({ where: { id: branchId, restaurant_id } })
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })

  // Count total active branches
  const activeBranchCount = await prisma.branch.count({
    where: { restaurant_id, is_active: true },
  })

  if (activeBranchCount <= 1 && branch.is_active) {
    return NextResponse.json(
      { error: "Cannot deactivate the last active branch" },
      { status: 400 }
    )
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: { is_active: false },
  })

  return NextResponse.json({ branch: updated, message: "Branch deactivated" })
}
