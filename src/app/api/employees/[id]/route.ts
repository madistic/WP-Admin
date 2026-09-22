import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { requireAdminApi } from "@/lib/role-check"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: employeeId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const body = await request.json()
    const { name, email, password, phone, is_active } = body
    
    const restaurantId = session.user.restaurant_id

    const existing = await prisma.user.findFirst({
      where: { id: employeeId, restaurant_id: restaurantId, role: "BRANCH_STAFF" }
    })
    
    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    if (email && email !== existing.email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } })
      if (existingEmail) {
        return NextResponse.json({ error: "Email is already in use" }, { status: 400 })
      }
    }

    const updateData: any = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(is_active !== undefined && { is_active }),
    }

    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10)
    }

    const employee = await prisma.user.update({
      where: { id: employeeId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        is_active: true,
        employee_code: true,
        created_at: true,
        assigned_orders: {
          where: { status: "DELIVERED" },
          select: { total: true }
        }
      }
    })

    const formatted = {
      ...employee,
      total_sales: employee.assigned_orders.reduce((sum, o) => sum + o.total, 0),
      assigned_orders: undefined
    }

    return NextResponse.json(formatted)
  } catch (error: any) {
    console.error("Update Employee Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: employeeId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const restaurantId = session.user.restaurant_id

    const existing = await prisma.user.findFirst({
      where: { id: employeeId, restaurant_id: restaurantId, role: "BRANCH_STAFF" },
      include: { _count: { select: { assigned_orders: true } } }
    })
    
    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    if (existing._count.assigned_orders > 0) {
      // Soft delete if they have orders
      await prisma.user.update({
        where: { id: employeeId },
        data: { is_active: false }
      })
      return NextResponse.json({ success: true, archived: true })
    }

    await prisma.user.delete({ where: { id: employeeId } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete Employee Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
