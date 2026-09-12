import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { UserRole } from "@prisma/client"

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 })
    }

    const {
      loyalty_enabled,
      loyalty_points_value_inr,
      loyalty_amount_for_one_point,
      loyalty_min_order_value,
      loyalty_max_redemption_percent
    } = await request.json()

    const updated = await prisma.restaurant.update({
      where: { id: session.user.restaurant_id },
      data: {
        loyalty_enabled: Boolean(loyalty_enabled),
        loyalty_points_value_inr: Number(loyalty_points_value_inr) || 1,
        loyalty_amount_for_one_point: Number(loyalty_amount_for_one_point) || 100,
        loyalty_min_order_value: Number(loyalty_min_order_value) || 0,
        loyalty_max_redemption_percent: Number(loyalty_max_redemption_percent) || 0,
      }
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Loyalty settings update error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
