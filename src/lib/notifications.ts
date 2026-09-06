import { Order } from "@prisma/client"
import { sendWhatsAppTextMessage } from "./whatsapp/client"
import prisma from "./prisma"

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
  private async getPhoneNumberId(restaurantId: string): Promise<string | null> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { whatsapp_phone_number_id: true, name: true },
    })
    return restaurant?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || null
  }

  private async getRestaurantName(restaurantId: string): Promise<string> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    })
    return restaurant?.name || "the restaurant"
  }

  async sendOrderAccepted(order: Order, customerPhone: string) {
    const phoneId = await this.getPhoneNumberId(order.restaurant_id)
    if (!phoneId) return
    const restaurantName = await this.getRestaurantName(order.restaurant_id)
    const text = `🎉 *Order Accepted!*\nYour order #${order.order_number} from *${restaurantName}* has been accepted by the restaurant. 👨‍🍳\n\nWe’ll keep you updated. 📦`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderOutForDelivery(order: Order, customerPhone: string) {
    const phoneId = await this.getPhoneNumberId(order.restaurant_id)
    if (!phoneId) return
    const text = `🛵 *Out for Delivery!*\nYour order #${order.order_number} is on its way to you!`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderDelivered(order: Order, customerPhone: string) {
    const phoneId = await this.getPhoneNumberId(order.restaurant_id)
    if (!phoneId) return
    const text = `✅ *Delivered!*\nYour order #${order.order_number} has been delivered. Enjoy your meal! 🍽️`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }

  async sendOrderRejected(order: Order, customerPhone: string, reason?: string) {
    const phoneId = await this.getPhoneNumberId(order.restaurant_id)
    if (!phoneId) return
    const restaurantName = await this.getRestaurantName(order.restaurant_id)
    const text = `❌ *Order Cancelled*\nUnfortunately, your order #${order.order_number} from *${restaurantName}* was cancelled.\n${reason ? `Reason: ${reason}` : "Please contact us for more details."}`
    await sendWhatsAppTextMessage(phoneId, customerPhone, text)
  }
}

export const notificationService: NotificationProvider = new WhatsAppNotificationProvider()
