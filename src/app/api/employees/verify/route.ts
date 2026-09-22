import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json({ error: "Employee code is required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    const employee = await prisma.user.findFirst({
      where: {
        restaurant_id: restaurantId,
        role: "BRANCH_STAFF",
        employee_code: code,
        is_active: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        employee_code: true
      }
    })

    if (!employee) {
      return NextResponse.json({ error: "Invalid employee code or employee is inactive" }, { status: 404 })
    }

    return NextResponse.json(employee)
  } catch (error: any) {
    console.error("Verify Employee Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
