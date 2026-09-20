import { Order } from "@prisma/client"
import { sendWhatsAppTextMessage } from "./whatsapp/client"
import prisma from "./prisma"
import { CUSTOMER_BRAND_NAME } from "./whatsapp/branding"

export interface NotificationProvider {
  sendOrderAccepted(order: Order, customerPhone: string): Promise<void>
  sendOrderOutForDelivery(order: Order, customerPhone: string): Promise<void>
  sendOrderDelivered(order: Order, customerPhone: string): Promise<void>
  sendOrderRejected(order: Order, customerPhone: string, reason?: string): Promise<void>
}

export class MockNotificationProvider implements NotificationProvider {
  async sendOrderAccepted(order: Order, customerPhone: string) {
    console.log(`[MOCK NOTIFICATION] Order ${order.order_number} ACCEPTED. Sent to ${customerPhone}.`)
  }

  async sendOrderOutForDelivery(order: Order, customerPhone: string) {
    console.log(`[MOCK NOTIFICATION] Order ${order.order_number} OUT FOR DELIVERY. Sent to ${customerPhone}.`)
  }

  async sendOrderDelivered(order: Order, customerPhone: string) {
    console.log(`[MOCK NOTIFICATION] Order ${order.order_number} DELIVERED. Sent to ${customerPhone}.`)
  }

  async sendOrderRejected(order: Order, customerPhone: string, reason?: string) {
    console.log(`[MOCK NOTIFICATION] Order ${order.order_number} REJECTED. Sent to ${customerPhone}. Reason: ${reason || 'N/A'}`)
  }
}

export class WhatsAppNotificationProvider implements NotificationProvider {
  /** Returns phone number ID + google_review_url in one query */
  private async getRestaurantMeta(restaurantId: string): Promise<{
    phoneId: string | null
    googleReviewUrl: string | null
  }> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { whatsapp_phone_number_id: true, google_review_url: true },
    })
    return {
      phoneId: restaurant?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      googleReviewUrl: restaurant?.google_review_url?.trim() || null,
    }
  }

  async sendOrderAccepted(order: Order, customerPhone: string) {
    const { phoneId } = await this.getRestaurantMeta(order.restaurant_id)
    if (!phoneId) return
    const text = `🎉 *Order Accepted!*\nYour order #${order.order_number} from *${CUSTOMER_BRAND_NAME}* has been accepted. 👨‍🍳\n\nWe're preparing it with care. 📦`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderOutForDelivery(order: Order, customerPhone: string) {
    const { phoneId } = await this.getRestaurantMeta(order.restaurant_id)
    if (!phoneId) return
    if (order.order_type === "TAKEAWAY") {
      await sendWhatsAppTextMessage(phoneId, customerPhone, "🍽️ Your order is ready for pickup! 🎉\nYou can collect it now.")
      return
    }
    const text = `🛵 *Out for Delivery!*\nYour order #${order.order_number} is on its way! Keep an eye out. 😊`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderDelivered(order: Order, customerPhone: string) {
    const { phoneId, googleReviewUrl } = await this.getRestaurantMeta(order.restaurant_id)
    if (!phoneId) return

    // Only append the Google Review link for HOME_DELIVERY orders (not POS / TAKEAWAY / DINING)
    const isHomeDelivery = order.order_type === "HOME_DELIVERY"
    const reviewMessage =
      isHomeDelivery && googleReviewUrl
        ? `\n\n⭐ *Enjoyed your meal?*\nLeave us a Google review — it means the world to us! 🙏\n👉 ${googleReviewUrl}`
        : ""

    const text = `✅ *Delivered!*\nYour order #${order.order_number} from *${CUSTOMER_BRAND_NAME}* has arrived. Enjoy every bite! 🍽️${reviewMessage}`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderRejected(order: Order, customerPhone: string, reason?: string) {
    const { phoneId } = await this.getRestaurantMeta(order.restaurant_id)
    if (!phoneId) return
    const text = `❌ *Order Cancelled*\nYour order #${order.order_number} from *${CUSTOMER_BRAND_NAME}* was cancelled.\n${reason ? `Reason: ${reason}` : "Please contact us if you need help."}`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }
}

export const notificationService: NotificationProvider = new WhatsAppNotificationProvider()

