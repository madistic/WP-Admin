import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { requireAdminApi } from "@/lib/role-check"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const restaurantId = session.user.restaurant_id

    const employees = await prisma.user.findMany({
      where: {
        restaurant_id: restaurantId,
        role: "BRANCH_STAFF",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        is_active: true,
        employee_code: true,
        created_at: true,
        assigned_orders: {
          where: {
            status: "DELIVERED"
          },
          select: {
            total: true
          }
        }
      },
      orderBy: { created_at: "desc" },
    })

    const formatted = employees.map(emp => ({
      ...emp,
      total_sales: emp.assigned_orders.reduce((sum, o) => sum + o.total, 0),
      assigned_orders: undefined
    }))

    return NextResponse.json(formatted)
  } catch (error: any) {
    console.error("Fetch Employees Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const body = await request.json()
    const { name, email, password, phone, is_active } = body
    
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    // Check if email is already taken globally
    const existingEmail = await prisma.user.findUnique({
      where: { email }
    })
    if (existingEmail) {
      return NextResponse.json({ error: "Email is already in use" }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const employee = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password_hash: hashedPassword,
        role: "BRANCH_STAFF",
        restaurant_id: restaurantId,
        is_active: is_active ?? true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        is_active: true,
        employee_code: true,
        created_at: true,
      }
    })

    return NextResponse.json({ ...employee, total_sales: 0 }, { status: 201 })
  } catch (error: any) {
    console.error("Create Employee Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
