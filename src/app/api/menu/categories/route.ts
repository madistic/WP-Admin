import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemWithVariants } from "@/lib/whatsapp/catalog"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { name, description, is_active } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    const duplicate = await prisma.menuCategory.findFirst({
      where: { restaurant_id: restaurantId, name: { equals: name.trim(), mode: "insensitive" } },
    })
    if (duplicate) return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 })

    const count = await prisma.menuCategory.count({ where: { restaurant_id: restaurantId } })

    const category = await prisma.menuCategory.create({
      data: {
        restaurant_id: restaurantId,
        name: name.trim(),
        description: description?.trim() || null,
        is_active: is_active ?? true,
        sort_order: count,
      },
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error: any) {
    console.error("Create Category Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { id, name, description, is_active, sort_order } = body

    if (!id) return NextResponse.json({ error: "Category ID is required" }, { status: 400 })

    const restaurantId = session.user.restaurant_id

    const existing = await prisma.menuCategory.findFirst({
      where: { id, restaurant_id: restaurantId },
    })

    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    if (name !== undefined) {
      const normalizedName = name.trim()
      if (!normalizedName) return NextResponse.json({ error: "Category name is required" }, { status: 400 })
      const duplicate = await prisma.menuCategory.findFirst({
        where: {
          restaurant_id: restaurantId,
          name: { equals: normalizedName, mode: "insensitive" },
          NOT: { id },
        },
      })
      if (duplicate) return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 })
    }

    const updated = await prisma.menuCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) }),
        ...(sort_order !== undefined && { sort_order: Number(sort_order) }),
      },
    })

    if (name !== undefined && name.trim() !== existing.name) {
      const items = await prisma.menuItem.findMany({
        where: { category_id: id, is_active: true, deleted_at: null },
        select: { id: true },
      })
      await Promise.allSettled(items.map((item) => syncMenuItemWithVariants(item.id)))
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Update Category Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "Category ID is required" }, { status: 400 })

    const restaurantId = session.user.restaurant_id

    const category = await prisma.menuCategory.findFirst({
      where: { id, restaurant_id: restaurantId },
      include: { _count: { select: { items: true } } },
    })

    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    if (category._count.items > 0) {
      return NextResponse.json(
        {
          error: `Category contains ${category._count.items} menu item(s). Move or delete items before deleting the category.`,
          hasItems: true,
          itemCount: category._count.items,
        },
        { status: 409 }
      )
    }

    await prisma.menuCategory.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Delete Category Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete category" }, { status: 500 })
  }
}
