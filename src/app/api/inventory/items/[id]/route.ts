import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireAdminApi } from "@/lib/role-check"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const restaurantId = session.user.restaurant_id
    const item = await prisma.inventoryItem.findFirst({
      where: { id, restaurant_id: restaurantId },
      include: {
        branch: true,
        ingredients: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                price: true,
                is_available: true,
                is_active: true,
              },
            },
          },
        },
        transactions: {
          orderBy: { created_at: "desc" },
          take: 20,
          include: {
            order: {
              select: {
                id: true,
                order_number: true,
                source: true,
                status: true,
              },
            },
          },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    }

    const qty = Number(item.quantity)
    const min = Number(item.minimum_stock)
    const cost = item.cost_per_unit ? Number(item.cost_per_unit) : null

    return NextResponse.json({
      id: item.id,
      restaurant_id: item.restaurant_id,
      branch_id: item.branch_id,
      branch: item.branch,
      name: item.name,
      quantity: qty,
      unit: item.unit,
      opening_stock: Number(item.opening_stock),
      minimum_stock: min,
      reorder_level: Number(item.reorder_level),
      cost_per_unit: cost,
      total_value: cost ? qty * cost : null,
      is_active: item.is_active,
      is_low_stock: qty > 0 && qty <= min,
      is_out_of_stock: qty <= 0,
      recipes: item.ingredients.map((ing) => ({
        menu_item_id: ing.menu_item_id,
        menu_item_name: ing.menuItem.name,
        recipe_quantity: Number(ing.quantity),
        recipe_unit: ing.unit,
        is_available: ing.menuItem.is_available,
        is_active: ing.menuItem.is_active,
      })),
      recent_transactions: item.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        quantity: Number(tx.quantity),
        previous_quantity: tx.previous_quantity ? Number(tx.previous_quantity) : null,
        new_quantity: tx.new_quantity ? Number(tx.new_quantity) : null,
        unit_cost: tx.unit_cost ? Number(tx.unit_cost) : null,
        total_cost: tx.total_cost ? Number(tx.total_cost) : null,
        reason: tx.reason,
        created_at: tx.created_at,
        order: tx.order,
      })),
      created_at: item.created_at,
      updated_at: item.updated_at,
    })
  } catch (error: any) {
    console.error("Get Inventory Item Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const restaurantId = session.user.restaurant_id
    const item = await prisma.inventoryItem.findFirst({
      where: { id, restaurant_id: restaurantId },
    })

    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      unit,
      minimum_stock,
      reorder_level,
      cost_per_unit,
      is_active,
      branch_id,
    } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (unit !== undefined) updateData.unit = unit.trim()
    if (minimum_stock !== undefined) updateData.minimum_stock = new Prisma.Decimal(parseFloat(minimum_stock).toFixed(3))
    if (reorder_level !== undefined) updateData.reorder_level = new Prisma.Decimal(parseFloat(reorder_level).toFixed(3))
    if (cost_per_unit !== undefined) {
      updateData.cost_per_unit = cost_per_unit !== null && cost_per_unit !== "" ? new Prisma.Decimal(parseFloat(cost_per_unit).toFixed(2)) : null
    }
    if (is_active !== undefined) updateData.is_active = Boolean(is_active)
    if (branch_id !== undefined) updateData.branch_id = branch_id || null

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      ...updated,
      quantity: Number(updated.quantity),
      opening_stock: Number(updated.opening_stock),
      minimum_stock: Number(updated.minimum_stock),
      reorder_level: Number(updated.reorder_level),
      cost_per_unit: updated.cost_per_unit ? Number(updated.cost_per_unit) : null,
    })
  } catch (error: any) {
    console.error("Update Inventory Item Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const restaurantId = session.user.restaurant_id
    const item = await prisma.inventoryItem.findFirst({
      where: { id, restaurant_id: restaurantId },
      include: {
        _count: {
          select: {
            ingredients: true,
            transactions: true,
          },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    }

    // If item has transaction history or is linked to recipes, soft-delete by deactivating
    if (item._count.transactions > 0 || item._count.ingredients > 0) {
      await prisma.inventoryItem.update({
        where: { id },
        data: { is_active: false },
      })
      return NextResponse.json({ success: true, deactivated: true, message: "Item has history; marked as inactive." })
    }

    // Otherwise safely delete
    await prisma.inventoryItem.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, deleted: true })
  } catch (error: any) {
    console.error("Delete Inventory Item Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
