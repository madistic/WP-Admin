import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurant_id },
    })

    return NextResponse.json(restaurant)
  } catch (error: any) {
    console.error("Fetch Restaurant Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    const updated = await prisma.restaurant.update({
      where: { id: session.user.restaurant_id },
      data: {
        ...(body.is_open !== undefined && { is_open: Boolean(body.is_open) }),
        ...(body.minimum_order !== undefined && { minimum_order: parseFloat(body.minimum_order) }),
        ...(body.delivery_fee !== undefined && { delivery_fee: parseFloat(body.delivery_fee) }),
        ...(body.description !== undefined && { description: body.description }),
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Update Restaurant Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
