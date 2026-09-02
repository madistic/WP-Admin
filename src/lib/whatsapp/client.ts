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

export interface WhatsAppInteractiveButtonsPayload {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: "interactive"
  interactive: {
    type: "button"
    header?: { type: "text"; text: string }
    body: { text: string }
    footer?: { text: string }
    action: {
      buttons: Array<{
        type: "reply"
        reply: {
          id: string
          title: string
        }
      }>
    }
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
  payload: WhatsAppTextMessagePayload | WhatsAppInteractiveListPayload | WhatsAppInteractiveButtonsPayload
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

/**
 * Sends interactive reply buttons (max 3 buttons).
 */
export async function sendWhatsAppInteractiveButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  options?: { headerText?: string; footerText?: string }
) {
  // Truncate button titles to 20 chars per Meta API limits
  const formattedButtons = buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: {
      id: b.id,
      title: b.title.slice(0, 20),
    },
  }))

  const payload: WhatsAppInteractiveButtonsPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: formattedButtons,
      },
    },
  }

  if (options?.headerText) {
    payload.interactive.header = { type: "text", text: options.headerText }
  }
  if (options?.footerText) {
    payload.interactive.footer = { text: options.footerText }
  }

  return await sendWhatsAppCloudMessage(phoneNumberId, payload)
}

/**
 * Sends interactive list message (max 10 rows total).
 */
export async function sendWhatsAppInteractiveList(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttonTitle: string,
  sections: Array<{
    title?: string
    rows: Array<{ id: string; title: string; description?: string }>
  }>,
  options?: { headerText?: string; footerText?: string }
) {
  // Enforce Meta API limits (button title <= 20 chars, row title <= 24 chars, row description <= 72 chars)
  const formattedSections = sections.map((sec) => ({
    title: sec.title ? sec.title.slice(0, 24) : undefined,
    rows: sec.rows.map((r) => ({
      id: r.id,
      title: r.title.slice(0, 24),
      description: r.description ? r.description.slice(0, 72) : undefined,
    })),
  }))

  const payload: WhatsAppInteractiveListPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonTitle.slice(0, 20),
        sections: formattedSections,
      },
    },
  }

  if (options?.headerText) {
    payload.interactive.header = { type: "text", text: options.headerText }
  }
  if (options?.footerText) {
    payload.interactive.footer = { text: options.footerText }
  }

  return await sendWhatsAppCloudMessage(phoneNumberId, payload)
}
