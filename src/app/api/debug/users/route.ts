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

    const users = await prisma.user.findMany({
      where: { restaurant_id: session.user.restaurant_id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branch_id: true,
        is_active: true,
        branch: { select: { name: true } },
      },
    })

    return NextResponse.json(
      users.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        branchName: u.branch?.name ?? "None (Global)",
        isActive: u.is_active,
      }))
    )
  } catch (err: any) {
    console.error("Debug users error:", err?.message)
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
