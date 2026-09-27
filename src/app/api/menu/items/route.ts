import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { syncNewMenuItemBeforeSave, syncMenuItemVariantToMetaCatalog } from "@/lib/whatsapp/catalog"
import { requireAdminApi } from "@/lib/role-check"
import crypto from "crypto"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const adminError = requireAdminApi(session)
    if (adminError) return adminError

    const body = await request.json()
    const {
      category_id,
      name,
      description,
      price,
      image_url,
      is_available,
      is_active,
      is_veg,
      prep_time_minutes,
      is_today_special,
      special_until_date,
      is_bestseller,
      variants,
      addons,
      ingredients, // Array of { inventory_item_id: string, quantity: number, unit: string }
    } = body

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Validate menu item + ingredients
    // ─────────────────────────────────────────────────────────────
    if (!category_id || !name || price === undefined) {
      return NextResponse.json({ error: "Category, Name, and Price are required" }, { status: 400 })
    }

    const restaurantId = session.user.restaurant_id

    // Validate category belongs to this restaurant
    const categoryExists = await prisma.menuCategory.findFirst({
      where: { id: category_id, restaurant_id: restaurantId },
    })
    if (!categoryExists) {
      return NextResponse.json({ error: "Category does not exist for this restaurant" }, { status: 400 })
    }

    // Validate ingredients if provided
    const validIngredients: Array<{ inventory_item_id: string; quantity: number; unit: string }> = []
    if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
      const inventoryItemIds = ingredients.map((ing: any) => ing.inventory_item_id).filter(Boolean)
      
      // Check that all referenced inventory items exist and belong to this restaurant
      const matchingInventoryItems = await prisma.inventoryItem.findMany({
        where: {
          id: { in: inventoryItemIds },
          restaurant_id: restaurantId,
          is_active: true,
        },
      })

      if (matchingInventoryItems.length !== inventoryItemIds.length) {
        return NextResponse.json(
          { error: "One or more selected inventory items are invalid or inactive for your restaurant" },
          { status: 400 }
        )
      }

      for (const ing of ingredients) {
        const qty = parseFloat(ing.quantity)
        if (isNaN(qty) || qty <= 0) {
          return NextResponse.json(
            { error: `Invalid quantity "${ing.quantity}" for ingredient.` },
            { status: 400 }
          )
        }
        if (!ing.unit || typeof ing.unit !== "string") {
          return NextResponse.json(
            { error: "Unit is required for each ingredient." },
            { status: 400 }
          )
        }
        validIngredients.push({
          inventory_item_id: ing.inventory_item_id,
          quantity: qty,
          unit: ing.unit.trim(),
        })
      }
    }

    const itemId = crypto.randomUUID()
    const parsedPrice = parseFloat(price)

    // ─────────────────────────────────────────────────────────────
    // STEP 2 & 3: Sync to Meta Catalog & wait for actual verification FIRST
    // HTTP 200 alone is NOT success. Ingredient details are NOT sent to Meta.
    // ─────────────────────────────────────────────────────────────
    console.log(`[Menu Item Create Flow] Syncing new item '${name.trim()}' to Meta Catalog first...`)
    const metaSyncResult = await syncNewMenuItemBeforeSave({
      id: itemId,
      restaurant_id: restaurantId,
      category_id,
      name: name.trim(),
      description: description?.trim() || null,
      price: parsedPrice,
      image_url: image_url?.trim() || null,
      is_available: is_available ?? true,
      is_active: is_active ?? true,
    })

    if (!metaSyncResult.success) {
      console.error(
        `[Menu Item Create Flow] Meta Catalog Sync failed for '${name}': ${metaSyncResult.error}. Aborting DB creation.`
      )
      return NextResponse.json(
        {
          error: `Meta Catalog Sync Failed: ${metaSyncResult.error || "Unable to verify product in Meta Catalog"}. Item was not saved to database.`,
        },
        { status: 400 }
      )
    }

    console.log(
      `[Menu Item Create Flow] Meta Catalog sync verified successfully for '${name}'. Now committing to DB...`
    )

    // ─────────────────────────────────────────────────────────────
    // STEP 4: ONLY after Meta sync succeeds:
    // Create MenuItem in DB + create MenuItemIngredient records in a transaction
    // ─────────────────────────────────────────────────────────────
    const count = await prisma.menuItem.count({ where: { restaurant_id: restaurantId } })

    const createdItem = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({
        data: {
          id: itemId,
          restaurant_id: restaurantId,
          category_id,
          name: name.trim(),
          description: description?.trim() || null,
          price: parsedPrice,
          image_url: image_url?.trim() || null,
          meta_product_sku: metaSyncResult.metaProductSku || itemId,
          meta_sync_status: "SYNCED",
          meta_sync_error: null,
          meta_synced_at: new Date(),
          is_available: is_available ?? true,
          is_active: is_active ?? true,
          is_veg: is_veg ?? true,
          prep_time_minutes: prep_time_minutes ? parseInt(prep_time_minutes, 10) : 15,
          is_today_special: Boolean(is_today_special),
          special_until_date: special_until_date ? new Date(special_until_date) : null,
          is_bestseller: Boolean(is_bestseller),
          sort_order: count,
          variants: variants && Array.isArray(variants)
            ? {
                create: variants.map((v: any, index: number) => ({
                  name: v.name,
                  price: parseFloat(v.price),
                  is_available: v.is_available ?? true,
                  sort_order: index,
                })),
              }
            : undefined,
          addons: addons && Array.isArray(addons)
            ? {
                create: addons.map((a: any) => ({
                  name: a.name,
                  price: parseFloat(a.price),
                  is_available: a.is_available ?? true,
                })),
              }
            : undefined,
          ingredients: validIngredients.length > 0
            ? {
                create: validIngredients.map((ing) => ({
                  inventory_item_id: ing.inventory_item_id,
                  quantity: new Prisma.Decimal(ing.quantity.toFixed(3)),
                  unit: ing.unit,
                })),
              }
            : undefined,
        },
        include: {
          category: true,
          variants: true,
          addons: true,
          ingredients: {
            include: {
              inventoryItem: true,
            },
          },
        },
      })

      return item
    })

    // If variants exist, sync variants to Meta in the background or sequentially
    if (createdItem.variants && createdItem.variants.length > 0) {
      for (const variant of createdItem.variants) {
        try {
          await syncMenuItemVariantToMetaCatalog(variant.id)
        } catch (vErr: any) {
          console.warn(`[Meta Catalog Variant Sync] Warning on variant ${variant.name}:`, vErr.message)
        }
      }
    }

    return NextResponse.json(createdItem, { status: 201 })
  } catch (error: any) {
    console.error("Create Menu Item Error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
