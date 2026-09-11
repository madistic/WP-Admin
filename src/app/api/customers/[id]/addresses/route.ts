import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getDefaultBranchId } from "@/lib/branch-scope"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const branchScope = session.user.branch_id ? { branch_id: session.user.branch_id } : {}

    const addresses = await prisma.customerAddress.findMany({
      where: { customer_id: customerId, restaurant_id: session.user.restaurant_id, ...branchScope },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    })

    return NextResponse.json(addresses)
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { address_type, label, recipient_name, phone_number, address_line, address_line_2, landmark, city, state, pincode, delivery_instructions, is_default } = body
    const branchId = session.user.branch_id ?? (await getDefaultBranchId(session.user.restaurant_id))

    if (!branchId) {
      return NextResponse.json({ error: "No branch available for this restaurant." }, { status: 400 })
    }

    if (!address_line) {
      return NextResponse.json({ error: "Address line is required" }, { status: 400 })
    }

    if (is_default) {
      // Clear existing default flags
      await prisma.customerAddress.updateMany({
        where: { customer_id: customerId, restaurant_id: session.user.restaurant_id, ...(session.user.branch_id ? { branch_id: session.user.branch_id } : {}) },
        data: { is_default: false },
      })
    }

    const address = await prisma.customerAddress.create({
      data: {
        restaurant_id: session.user.restaurant_id,
        branch_id: branchId,
        customer_id: customerId,
        address_type: address_type || "Home",
        label,
        recipient_name,
        phone_number,
        address_line,
        address_line_2,
        landmark,
        city,
        state,
        pincode,
        delivery_instructions,
        is_default: Boolean(is_default),
      },
    })

    await prisma.customerActivity.create({
      data: {
        restaurant_id: session.user.restaurant_id,
        branch_id: branchId,
        customer_id: customerId,
        type: "ADDRESS_ADDED",
        description: `Added new ${address.address_type} address: ${address.address_line}`,
      },
    })

    return NextResponse.json(address, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
