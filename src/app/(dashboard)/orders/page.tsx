import OrderBoard from "@/components/OrderBoard"

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-gray-900">Active Orders</h2>
      </div>
      
      <OrderBoard />
    </div>
  )
}
