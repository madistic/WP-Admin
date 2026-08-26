import { NextResponse } from "next/server"

/**
 * GET /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Webhook Verification Endpoint
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN

    if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
      console.log("[WhatsApp Webhook] Verification successful")
      return new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }

    console.warn("[WhatsApp Webhook] Verification failed. Token mismatch or missing params.")
    return new NextResponse("Forbidden", { status: 403 })
  } catch (error) {
    console.error("[WhatsApp Webhook] GET Verification error:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

/**
 * POST /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Event Notification Listener Endpoint
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== "object") {
      console.warn("[WhatsApp Webhook] Received invalid or non-JSON body")
      return NextResponse.json({ status: "invalid_payload" }, { status: 400 })
    }

    // Verify object type is WhatsApp business account
    if (body.object !== "whatsapp_business_account") {
      console.warn(`[WhatsApp Webhook] Ignored non-whatsapp object: ${body.object}`)
      return NextResponse.json({ status: "ignored" }, { status: 200 })
    }

    // Meta sends array of entries
    const entries = Array.isArray(body.entry) ? body.entry : []

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : []

      for (const change of changes) {
        const value = change?.value
        if (!value) continue

        const phoneNumberId = value.metadata?.phone_number_id
        const displayPhoneNumber = value.metadata?.display_phone_number

        // Extract messages array if present
        const messages = Array.isArray(value.messages) ? value.messages : []

        for (const message of messages) {
          const messageId = message?.id
          const from = message?.from
          const messageType = message?.type
          const timestamp = message?.timestamp

          let textBody: string | undefined = undefined
          if (messageType === "text") {
            textBody = message?.text?.body
          }

          // Sanitized logging
          console.log("[WhatsApp Webhook] Event Received:", {
            phoneNumberId,
            displayPhoneNumber,
            sender: from ? `***${from.slice(-4)}` : "unknown",
            messageId,
            type: messageType,
            textSnippet: textBody ? textBody.slice(0, 30) : undefined,
            timestamp,
          })
        }

        // Extract statuses array if present (delivered, read notifications)
        const statuses = Array.isArray(value.statuses) ? value.statuses : []
        for (const statusObj of statuses) {
          console.log("[WhatsApp Webhook] Status Update Received:", {
            status: statusObj?.status,
            recipientId: statusObj?.recipient_id ? `***${statusObj.recipient_id.slice(-4)}` : "unknown",
            messageId: statusObj?.id,
          })
        }
      }
    }

    // Always return HTTP 200 OK quickly for Meta Cloud API webhooks
    return NextResponse.json({ status: "ok" }, { status: 200 })
  } catch (error) {
    console.error("[WhatsApp Webhook] POST Processing Error:", error)
    // Return HTTP 200 to prevent Meta from continuously retrying failed webhooks during development
    return NextResponse.json({ status: "error_handled" }, { status: 200 })
  }
}
