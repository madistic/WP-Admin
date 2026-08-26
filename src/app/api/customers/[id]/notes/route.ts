import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const notes = await prisma.customerNote.findMany({
      where: { customer_id: customerId },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { created_at: "desc" },
    })

    return NextResponse.json(notes)
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
    const { note } = body

    if (!note?.trim()) {
      return NextResponse.json({ error: "Note content cannot be empty" }, { status: 400 })
    }

    const newNote = await prisma.customerNote.create({
      data: {
        customer_id: customerId,
        user_id: session.user.id,
        note: note.trim(),
      },
      include: {
        user: { select: { name: true } },
      },
    })

    await prisma.customerActivity.create({
      data: {
        customer_id: customerId,
        type: "NOTE_ADDED",
        description: `Internal staff note added by ${session.user.name || "staff"}`,
      },
    })

    return NextResponse.json(newNote, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
