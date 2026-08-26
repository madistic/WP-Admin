import { Order } from "@prisma/client"

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

// In the future, you can swap this with WhatsAppNotificationProvider
export const notificationService: NotificationProvider = new MockNotificationProvider()
