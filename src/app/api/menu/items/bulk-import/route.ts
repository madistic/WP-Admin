import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { syncMenuItemToMetaCatalog } from "@/lib/whatsapp/catalog"
import ExcelJS from "exceljs"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const restaurantId = session.user.restaurant_id

    const formData = await request.formData()
    const file = formData.get("file") as File
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return NextResponse.json({ error: "Excel file is empty" }, { status: 400 })
    }

    // Header row should be: Category, Name, Description, Price, ImageURL, IsVeg, PrepTime
    const rows = worksheet.getRows(2, worksheet.rowCount - 1) || []
    let successCount = 0
    let errorCount = 0
    let errors: string[] = []

    // Cache categories to avoid repeated DB calls
    const categoriesCache = new Map<string, string>()
    const existingCats = await prisma.menuCategory.findMany({
      where: { restaurant_id: restaurantId }
    })
    for (const cat of existingCats) {
      categoriesCache.set(cat.name.toLowerCase(), cat.id)
    }

    let sortOrder = await prisma.menuItem.count({ where: { restaurant_id: restaurantId } })

    for (const row of rows) {
      // row.values is 1-indexed array
      const rowValues = row.values as any[]
      if (!rowValues || rowValues.length < 3) continue // Skip empty rows

      const catName = rowValues[1]?.toString().trim()
      const name = rowValues[2]?.toString().trim()
      const description = rowValues[3]?.toString().trim() || ""
      const priceStr = rowValues[4]?.toString().trim()
      const imageUrl = rowValues[5]?.toString().trim() || null
      const isVegStr = rowValues[6]?.toString().trim().toLowerCase()
      const prepTimeStr = rowValues[7]?.toString().trim()

      if (!catName || !name || !priceStr) {
        if (catName || name || priceStr) { // If it's a partially filled row
          errorCount++
          errors.push(`Row ${row.number}: Missing required fields (Category, Name, Price)`)
        }
        continue
      }

      const price = parseFloat(priceStr)
      if (isNaN(price)) {
        errorCount++
        errors.push(`Row ${row.number}: Invalid price for item '${name}'`)
        continue
      }

      const isVeg = isVegStr === "yes" || isVegStr === "true" || isVegStr === "1" || isVegStr === "veg"
      const prepTime = prepTimeStr ? parseInt(prepTimeStr, 10) : 15

      // Get or create category
      let categoryId = categoriesCache.get(catName.toLowerCase())
      if (!categoryId) {
        const catCount = await prisma.menuCategory.count({ where: { restaurant_id: restaurantId } })
        const newCat = await prisma.menuCategory.create({
          data: {
            restaurant_id: restaurantId,
            name: catName,
            sort_order: catCount,
          }
        })
        categoryId = newCat.id
        categoriesCache.set(catName.toLowerCase(), categoryId)
      }

      try {
        const item = await prisma.menuItem.create({
          data: {
            restaurant_id: restaurantId,
            category_id: categoryId as string,
            name,
            description,
            price,
            image_url: imageUrl,
            is_veg: isVeg,
            prep_time_minutes: prepTime,
            is_available: true,
            is_active: true,
            sort_order: sortOrder++,
          }
        })
        
        // Sync to meta catalog
        const syncResult = await syncMenuItemToMetaCatalog(item.id)
        if (!syncResult.success) {
          console.warn(`[Bulk Import] Meta Catalog Sync failed for '${item.name}': ${syncResult.error}`)
        }
        
        successCount++
      } catch (err: any) {
        errorCount++
        errors.push(`Row ${row.number}: Failed to create item '${name}' - ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${successCount} items. ${errorCount > 0 ? `Failed to import ${errorCount} items.` : ''}`,
      errors
    }, { status: 200 })

  } catch (error: any) {
    console.error("Bulk Import Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
