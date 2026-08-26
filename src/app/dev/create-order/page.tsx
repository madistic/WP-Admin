import Link from "next/link"
import prisma from "@/lib/prisma"
import { createTestOrder } from "./actions"
import DevCreateOrderForm from "./DevCreateOrderForm"

export const dynamic = "force-dynamic"

export default async function DevCreateOrderPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      items: {
        where: {
          is_available: true,
          is_active: true,
          category: {
            is_active: true,
          },
        },
      },
    },
  })

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <Link href="/orders" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
            &larr; Back to Active Orders Dashboard
          </Link>
        </div>

        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-500 font-bold">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Development/Test Tool — Temporary
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  This page simulates direct customer ordering until WhatsApp integration is finalized.
                  Orders placed here immediately sync to your active Orders dashboard!
                </p>
              </div>
            </div>
          </div>
        </div>

        <DevCreateOrderForm restaurants={restaurants} createOrderAction={createTestOrder} />
      </div>
    </div>
  )
}
