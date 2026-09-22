import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import OrderAlertProvider from "@/components/OrderAlertProvider"
import PushNotificationManager from "@/components/PushNotificationManager"
import ClientAppShell from "@/components/ClientAppShell"
import prisma from "@/lib/prisma"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/login")
  }

  // Fetch store status for top header indicator
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurant_id },
    select: { name: true, is_open: true },
  })

  return (
    <ClientAppShell user={{ name: session.user.name, email: session.user.email, role: session.user.role }} restaurant={restaurant}>
      <OrderAlertProvider />
      <PushNotificationManager />
      {children}
    </ClientAppShell>
  )
}
