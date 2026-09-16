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

    const results: Array<{
      customer_id: string
      name: string
      phone: string
      status: "SENT" | "FAILED" | "SKIPPED"
      reason?: string
      meta_response?: any
    }> = []

    let sentCount = 0
    let failedCount = 0
    let skippedCount = 0

    // 3. Process each customer individually — never abort on one failure
    for (const customer of customers) {
      const customerLabel = `${customer.name} (${customer.id})`

      // Guard: must have a WhatsApp number
      if (!customer.whatsapp_number) {
        console.log(`[CRM] SKIP ${customerLabel}: no whatsapp_number`)
        results.push({ customer_id: customer.id, name: customer.name, phone: "(none)", status: "SKIPPED", reason: "No WhatsApp number on record" })
        skippedCount++
        continue
      }

      // Personalize message — returns null if {{favorite_item}} is required but unavailable
      const finalMessage = await personalizeMessage(message_template, customer.id, customer.name)
      if (!finalMessage) {
        console.log(`[CRM] SKIP ${customerLabel}: insufficient order history for {{favorite_item}}`)
        results.push({ customer_id: customer.id, name: customer.name, phone: customer.whatsapp_number, status: "SKIPPED", reason: "Message uses {{favorite_item}} but customer has insufficient order history (needs ≥2 orders of the same item)" })
        skippedCount++
        continue
      }

      // Check for duplicate (already received this campaign)
      const existingReceipt = await prisma.campaignReceipt.findUnique({
        where: { campaign_id_customer_id: { campaign_id: campaign.id, customer_id: customer.id } }
      })
      if (existingReceipt) {
        console.log(`[CRM] SKIP ${customerLabel}: already received this campaign`)
        results.push({ customer_id: customer.id, name: customer.name, phone: customer.whatsapp_number, status: "SKIPPED", reason: "Already sent in this campaign" })
        skippedCount++
        continue
      }

      // Normalise phone number — Meta requires E.164 without leading +
      // Customer numbers may be stored as "919876543210" or "+919876543210"
      const rawPhone = customer.whatsapp_number.trim()
      const recipientPhone = rawPhone.startsWith("+") ? rawPhone.slice(1) : rawPhone

      // Send the WhatsApp message
      console.log(`[CRM] Sending to ${customerLabel} → ${recipientPhone}`)
      const sendResult = await sendWhatsAppTextMessage(
        restaurant.whatsapp_phone_number_id!,
        recipientPhone,
        finalMessage
      )

      if (!sendResult.success && !sendResult.mock) {
        // Real failure — log Meta's error response and mark as failed
        console.error(`[CRM] FAILED ${customerLabel}:`, JSON.stringify(sendResult.response, null, 2))
        results.push({
          customer_id: customer.id,
          name: customer.name,
          phone: recipientPhone,
          status: "FAILED",
          reason: sendResult.response?.error?.message || "Meta API returned an error",
          meta_response: sendResult.response
        })
        failedCount++
        continue
      }

      // Success or mock — record receipt to prevent re-send
      try {
        await prisma.campaignReceipt.create({
          data: { campaign_id: campaign.id, customer_id: customer.id }
        })
      } catch (receiptErr: any) {
        // P2002 = unique constraint — safe to ignore (concurrent duplicate)
        if (receiptErr.code !== "P2002") {
          console.warn(`[CRM] Could not record receipt for ${customerLabel}:`, receiptErr.message)
        }
      }

      console.log(`[CRM] SENT ${customerLabel} → Meta message ID: ${sendResult.response?.messages?.[0]?.id ?? "(mock)"}`)
      results.push({
        customer_id: customer.id,
        name: customer.name,
        phone: recipientPhone,
        status: "SENT",
        meta_response: sendResult.mock ? { mock: true } : sendResult.response
      })
      sentCount++
    }

    // 4. Update campaign status
    await prisma.customerCampaign.update({
      where: { id: campaign.id },
      data: {
        status: "COMPLETED",
        total_sent: sentCount,
        last_run_at: new Date()
      }
    })

    // 5. Return accurate counts and per-customer breakdown
    const totalEligible = customers.length
    const responseBody = {
      campaign_id: campaign.id,
      total_eligible: totalEligible,
      total_sent: sentCount,
      total_failed: failedCount,
      total_skipped: skippedCount,
      results,
    }

    console.log(`[CRM] Campaign "${name}" complete. Eligible: ${totalEligible}, Sent: ${sentCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`)

    // Return HTTP error if nothing was sent at all due to failures (not just skips)
    if (sentCount === 0 && failedCount > 0) {
      return NextResponse.json({ error: "All sends failed. See results for details.", ...responseBody }, { status: 502 })
    }

    return NextResponse.json(responseBody)
  } catch (error: any) {
    console.error("[CRM] Campaign error:", error)
    return NextResponse.json({ error: "Internal Server Error", detail: error.message }, { status: 500 })
  }
}
