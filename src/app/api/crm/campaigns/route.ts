import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getCustomersForCampaign, personalizeMessage } from "@/lib/crm"
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurantId = session.user.restaurant_id
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    })

    if (!restaurant?.whatsapp_phone_number_id) {
      return NextResponse.json({ error: "WhatsApp is not configured for this restaurant." }, { status: 400 })
    }

    const body = await request.json()
    const { name, message_template, segment } = body

    if (!name || !message_template || !segment) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // 1. Fetch eligible customers
    const customers = await getCustomersForCampaign(restaurantId, { segment })
    
    if (customers.length === 0) {
      return NextResponse.json({ error: "No eligible customers found for this segment." }, { status: 400 })
    }

    // 2. Create Campaign Record
    const campaign = await prisma.customerCampaign.create({
      data: {
        restaurant_id: restaurantId,
        name,
        message_template,
        segment,
        status: "SENDING",
      }
    })

    let sentCount = 0

    // 3. Process each customer
    for (const customer of customers) {
      if (!customer.whatsapp_number) continue

      // Generate personalized message
      const finalMessage = await personalizeMessage(message_template, customer.id, customer.name)
      if (!finalMessage) {
        // Skip if personalization failed (e.g., no favorite item)
        continue
      }

      // Check for duplicate send using a transaction
      try {
        await prisma.$transaction(async (tx) => {
          // Attempt to create receipt (will throw if unique constraint fails)
          await tx.campaignReceipt.create({
            data: {
              campaign_id: campaign.id,
              customer_id: customer.id
            }
          })

          // Send WhatsApp message
          await sendWhatsAppTextMessage(
            restaurant.whatsapp_phone_number_id!,
            customer.whatsapp_number!,
            finalMessage
          )
          
          sentCount++
        })
      } catch (err: any) {
        // Unique constraint violation means we already sent to this customer
        if (err.code === 'P2002') {
          console.log(`[CRM] Skipped duplicate send to customer ${customer.id} for campaign ${campaign.id}`)
        } else {
          console.error(`[CRM] Failed to send to customer ${customer.id}:`, err)
        }
      }
    }

    // 4. Update campaign status
    const updatedCampaign = await prisma.customerCampaign.update({
      where: { id: campaign.id },
      data: {
        status: "COMPLETED",
        total_sent: sentCount,
        last_run_at: new Date()
      }
    })

    return NextResponse.json(updatedCampaign)
  } catch (error: any) {
    console.error("Create Campaign Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
