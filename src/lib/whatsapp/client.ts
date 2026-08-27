/**
 * Meta WhatsApp Cloud API Outbound Message Sender
 */

export interface WhatsAppTextMessagePayload {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: "text"
  text: {
    preview_url?: boolean
    body: string
  }
}

export interface WhatsAppInteractiveListPayload {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: "interactive"
  interactive: {
    type: "list"
    header?: { type: "text"; text: string }
    body: { text: string }
    footer?: { text: string }
    action: {
      button: string
      sections: Array<{
        title?: string
        rows: Array<{
          id: string
          title: string
          description?: string
        }>
      }>
    }
  }
}

/**
 * Sends an outbound message via Meta WhatsApp Cloud API.
 * Uses process.env.WHATSAPP_ACCESS_TOKEN.
 * In dev/test environments without token, logs cleanly without throwing.
 */
export async function sendWhatsAppCloudMessage(
  phoneNumberId: string,
  payload: WhatsAppTextMessagePayload | WhatsAppInteractiveListPayload
): Promise<{ success: boolean; response?: any; mock?: boolean }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN

  if (!token || token.trim() === "") {
    console.log(`[WhatsApp Client MOCK] Would send to ${payload.to} via ${phoneNumberId}:`, JSON.stringify(payload, null, 2))
    return { success: true, mock: true }
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error("[WhatsApp Client Error] Meta API response error:", data)
      return { success: false, response: data }
    }

    console.log(`[WhatsApp Client Success] Message sent to ${payload.to}. ID:`, data?.messages?.[0]?.id)
    return { success: true, response: data }
  } catch (error) {
    console.error("[WhatsApp Client Exception] Network error sending message:", error)
    return { success: false, response: error }
  }
}

/**
 * Sends a standard formatted text message to a WhatsApp user.
 */
export async function sendWhatsAppTextMessage(
  phoneNumberId: string,
  to: string,
  bodyText: string
) {
  return await sendWhatsAppCloudMessage(phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: bodyText,
    },
  })
}
