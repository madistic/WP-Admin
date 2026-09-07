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

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const action = body.action
    const categoryIds = Array.isArray(body.category_ids) ? body.category_ids.filter((id: unknown): id is string => typeof id === "string") : []
    if (categoryIds.length === 0) return NextResponse.json({ error: "Select at least one category." }, { status: 400 })

    const restaurantId = session.user.restaurant_id
    const categories = await prisma.menuCategory.findMany({
      where: { id: { in: categoryIds }, restaurant_id: restaurantId },
      include: { _count: { select: { items: true } } },
    })
    if (categories.length !== categoryIds.length) return NextResponse.json({ error: "One or more categories were not found." }, { status: 404 })

    if (action === "delete") {
      const affectedItems = categories.reduce((count, category) => count + category._count.items, 0)
      if (affectedItems > 0) {
        return NextResponse.json({ error: `Cannot delete selected categories: ${affectedItems} menu item(s) are still assigned. Move items first.`, affectedItems }, { status: 409 })
      }
      const result = await prisma.menuCategory.deleteMany({ where: { id: { in: categoryIds }, restaurant_id: restaurantId } })
      return NextResponse.json({ success: true, action, count: result.count })
    }

    if (action === "rename") {
      const renames = body.renames as Record<string, unknown> | undefined
      if (!renames) return NextResponse.json({ error: "Provide a new name for each selected category." }, { status: 400 })
      const names = categories.map((category) => {
        const nextName = renames[category.id]
        return { id: category.id, name: typeof nextName === "string" ? nextName.trim() : "" }
      })
      if (names.some((entry) => !entry.name)) return NextResponse.json({ error: "Every selected category needs a name." }, { status: 400 })
      const normalizedNames = names.map((entry) => entry.name.toLowerCase())
      if (new Set(normalizedNames).size !== normalizedNames.length) return NextResponse.json({ error: "Bulk rename names must be unique." }, { status: 409 })
      const outsideDuplicate = await prisma.menuCategory.findFirst({
        where: { restaurant_id: restaurantId, name: { in: names.map((entry) => entry.name), mode: "insensitive" }, NOT: { id: { in: categoryIds } } },
      })
      if (outsideDuplicate) return NextResponse.json({ error: `Category name '${outsideDuplicate.name}' already exists.` }, { status: 409 })

      await prisma.$transaction(names.map((entry) => prisma.menuCategory.update({ where: { id: entry.id }, data: { name: entry.name } })))
      const itemIds = await prisma.menuItem.findMany({ where: { category_id: { in: categoryIds }, is_active: true, deleted_at: null }, select: { id: true } })
      const syncResults = await Promise.allSettled(itemIds.map((item) => syncMenuItemWithVariants(item.id)))
      const failedSyncs = syncResults.filter((result) => result.status === "rejected" || !result.value.success).length
      return NextResponse.json({ success: true, action, count: names.length, failedSyncs })
    }

    if (action === "move") {
      const targetCategoryId = typeof body.target_category_id === "string" ? body.target_category_id : ""
      if (!targetCategoryId || categoryIds.includes(targetCategoryId)) return NextResponse.json({ error: "Choose a different destination category." }, { status: 400 })
      const targetCategory = await prisma.menuCategory.findFirst({ where: { id: targetCategoryId, restaurant_id: restaurantId } })
      if (!targetCategory) return NextResponse.json({ error: "Destination category not found." }, { status: 404 })
      const items = await prisma.menuItem.findMany({ where: { category_id: { in: categoryIds }, restaurant_id: restaurantId }, select: { id: true } })
      const result = await prisma.$transaction(async (tx) => tx.menuItem.updateMany({ where: { category_id: { in: categoryIds }, restaurant_id: restaurantId }, data: { category_id: targetCategoryId } }))
      const syncResults = await Promise.allSettled(items.map((item) => syncMenuItemWithVariants(item.id)))
      const failedSyncs = syncResults.filter((syncResult) => syncResult.status === "rejected" || !syncResult.value.success).length
      return NextResponse.json({ success: true, action, count: result.count, failedSyncs })
    }

    return NextResponse.json({ error: "Invalid bulk category action." }, { status: 400 })
  } catch (error: unknown) {
    console.error("Bulk Category Action Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bulk category action failed" }, { status: 500 })
  }
}
