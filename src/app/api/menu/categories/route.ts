import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemWithVariants, ensureMetaProductSet } from "@/lib/whatsapp/catalog"
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

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    const catalogId = restaurant?.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
    const token = process.env.WHATSAPP_ACCESS_TOKEN
    if (catalogId && token) {
      const metaId = await ensureMetaProductSet(catalogId, category.id, category.name, category.meta_product_set_id, token)
      if (metaId && metaId !== category.meta_product_set_id) {
        await prisma.menuCategory.update({ where: { id: category.id }, data: { meta_product_set_id: metaId } })
        category.meta_product_set_id = metaId
      }
    }

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
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } })
      const catalogId = restaurant?.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
      const token = process.env.WHATSAPP_ACCESS_TOKEN
      if (catalogId && token) {
        const metaId = await ensureMetaProductSet(catalogId, updated.id, updated.name, updated.meta_product_set_id, token)
        if (metaId && metaId !== updated.meta_product_set_id) {
          await prisma.menuCategory.update({ where: { id: updated.id }, data: { meta_product_set_id: metaId } })
        }
      }

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
    })

    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    // Count only non-soft-deleted items; ignore deleted_at IS NOT NULL rows
    const activeItemCount = await prisma.menuItem.count({
      where: { category_id: id, deleted_at: null },
    })

    if (activeItemCount > 0) {
      return NextResponse.json(
        {
          error: `Category still contains ${activeItemCount} active menu item(s). Move or delete them before removing the category.`,
          hasItems: true,
          itemCount: activeItemCount,
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
    })
    if (categories.length !== categoryIds.length) return NextResponse.json({ error: "One or more categories were not found." }, { status: 404 })

    if (action === "delete") {
      // Count only non-soft-deleted items across all selected categories
      const activeItemCount = await prisma.menuItem.count({
        where: { category_id: { in: categoryIds }, deleted_at: null },
      })
      if (activeItemCount > 0) {
        return NextResponse.json({ error: `Cannot delete selected categories: ${activeItemCount} active menu item(s) are still assigned. Move or delete items first.`, affectedItems: activeItemCount }, { status: 409 })
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
      
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } })
      const catalogId = restaurant?.whatsapp_catalog_id || process.env.WHATSAPP_CATALOG_ID
      const token = process.env.WHATSAPP_ACCESS_TOKEN
      
      if (catalogId && token) {
        for (const entry of names) {
          const category = categories.find(c => c.id === entry.id)
          if (category) {
            const metaId = await ensureMetaProductSet(catalogId, entry.id, entry.name, category.meta_product_set_id, token)
            if (metaId && metaId !== category.meta_product_set_id) {
              await prisma.menuCategory.update({ where: { id: entry.id }, data: { meta_product_set_id: metaId } })
            }
          }
        }
      }
      
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
