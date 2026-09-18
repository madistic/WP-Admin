import Link from "next/link"
import prisma from "@/lib/prisma"
import { createTestOrder, appendItemsToPosOrder, completePosOrder, deletePosOrder, updatePosOrderItem } from "./actions"
import DevCreateOrderForm from "./DevCreateOrderForm"

export const dynamic = "force-dynamic"

export default async function DevCreateOrderPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      categories: {
        where: { is_active: true },
        orderBy: { sort_order: "asc" },
        select: { id: true, name: true },
      },
      items: {
        where: {
          is_available: true,
          is_active: true,
          category: {
            is_active: true,
          },
        },
        include: { variants: true, addons: true },
      },
    },
  })

  // Fetch active POS sessions
  const activeSessions = await prisma.order.findMany({
    where: {
      source: "POS",
      status: "IN_PROCESS",
    },
    include: {
      items: true,
    },
    orderBy: { created_at: "desc" },
  })

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <Link href="/dashboard" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
            &larr; Back to Dashboard
          </Link>
        </div>

        <DevCreateOrderForm 
          restaurants={restaurants} 
          activeSessions={activeSessions}
          createOrderAction={createTestOrder} 
          appendItemsAction={appendItemsToPosOrder}
          completeOrderAction={completePosOrder}
          deleteSessionAction={deletePosOrder}
          updateItemAction={updatePosOrderItem}
        />
      </div>
    </div>
  )
}
