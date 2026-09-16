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

    const templates = await prisma.customerCampaignTemplate.findMany({
      where: { restaurant_id: session.user.restaurant_id },
      orderBy: { created_at: "desc" }
    })

    return NextResponse.json(templates)
  } catch (error: any) {
    console.error("Fetch Templates Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, message_body } = body

    if (!name || !message_body) {
      return NextResponse.json({ error: "Name and message body are required" }, { status: 400 })
    }

    const template = await prisma.customerCampaignTemplate.create({
      data: {
        restaurant_id: session.user.restaurant_id,
        name,
        message_body
      }
    })

    return NextResponse.json(template)
  } catch (error: any) {
    console.error("Create Template Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
