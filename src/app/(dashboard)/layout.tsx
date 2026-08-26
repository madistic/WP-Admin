import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import SidebarNav from "@/components/SidebarNav"
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
    <div className="min-h-screen bg-slate-50 flex font-sans antialiased text-gray-900">
      {/* Persistent Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col border-r border-slate-800">
        <div className="p-5 border-b border-slate-800/80">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-sm">
              RP
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-wide text-white leading-tight">
                RESTO<span className="text-indigo-400 font-bold">PRO</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">Owner Management Portal</p>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <SidebarNav />

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center flex-shrink-0">
              {session.user.name ? session.user.name.charAt(0).toUpperCase() : "O"}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-slate-200 truncate">{session.user.name || "Restaurant Owner"}</p>
              <p className="text-[10px] text-slate-400 truncate">{session.user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main App Content Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200/80 h-14 flex items-center px-6 justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-wider">
                RESTO<span className="text-indigo-600">PRO</span>
              </h1>
            </div>

            {/* Restaurant Store Acceptance Status Indicator */}
            {restaurant && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs">
                <span className={`w-2 h-2 rounded-full ${restaurant.is_open ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                <span className="font-medium text-slate-700">{restaurant.name}</span>
                <span className="text-slate-400">•</span>
                <span className={`font-semibold ${restaurant.is_open ? "text-emerald-700" : "text-rose-600"}`}>
                  {restaurant.is_open ? "Accepting Orders" : "Closed"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dev/create-order"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors border border-slate-200"
            >
              ⚡ Order Simulator
            </Link>

            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors px-2.5 py-1.5 rounded-md hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Page Main Content Area */}
        <main className="flex-1 p-6 overflow-auto bg-slate-50">{children}</main>
      </div>
    </div>
  )
}
