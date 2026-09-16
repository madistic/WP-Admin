import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCustomersForCampaign, personalizeMessage } from "@/lib/crm"
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client"

// A secret token should be passed to prevent unauthorized triggers
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch all active automated campaigns
    const automatedCampaigns = await prisma.customerCampaign.findMany({
      where: {
        is_automated: true,
        status: { in: ["DRAFT", "COMPLETED"] }, // automated campaigns can run multiple times
      },
      include: {
        restaurant: true
      }
    })

    let totalProcessed = 0

    for (const campaign of automatedCampaigns) {
      if (!campaign.restaurant.whatsapp_phone_number_id) continue

      // For a real production app, we would evaluate `automation_schedule` (cron) here.
      // For this implementation, we assume this endpoint is hit daily and we process the `automation_condition`.

      const customers = await getCustomersForCampaign(campaign.restaurant_id, {
        segment: campaign.segment as any
      })

      let sentCount = 0

      for (const customer of customers) {
        if (!customer.whatsapp_number) continue

        // Check if we already sent THIS specific automated campaign to THIS customer
        const existingReceipt = await prisma.campaignReceipt.findUnique({
          where: {
            campaign_id_customer_id: {
              campaign_id: campaign.id,
              customer_id: customer.id
            }
          }
        })

        if (existingReceipt) continue // Skip, already sent

        const finalMessage = await personalizeMessage(campaign.message_template, customer.id, customer.name)
        if (!finalMessage) continue

        try {
          await prisma.$transaction(async (tx) => {
            await tx.campaignReceipt.create({
              data: {
                campaign_id: campaign.id,
                customer_id: customer.id
              }
            })

            await sendWhatsAppTextMessage(
              campaign.restaurant.whatsapp_phone_number_id!,
              customer.whatsapp_number!,
              finalMessage
            )
            
            sentCount++
          })
        } catch (err) {
          console.error(`[CRON Automation] Failed to send to ${customer.id}:`, err)
        }
      }

      if (sentCount > 0) {
        await prisma.customerCampaign.update({
          where: { id: campaign.id },
          data: {
            total_sent: { increment: sentCount },
            last_run_at: new Date()
          }
        })
        totalProcessed++
      }
    }

    return NextResponse.json({ success: true, processedCampaigns: totalProcessed })
  } catch (error: any) {
    console.error("Cron Automations Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
