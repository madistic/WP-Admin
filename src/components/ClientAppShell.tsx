"use client"

import { useState } from "react"
import Link from "next/link"
import SidebarNav from "@/components/SidebarNav"
import SignOutButton from "@/components/SignOutButton"
import StoreStatusToggle from "@/components/StoreStatusToggle"

export default function ClientAppShell({
  children,
  user,
  restaurant,
}: {
  children: React.ReactNode
  user: { name?: string | null; email?: string | null }
  restaurant?: { name: string; is_open: boolean } | null
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans antialiased text-gray-900 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-sm">
              RP
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-wide text-white leading-tight">
                RESTO<span className="text-indigo-400 font-bold">PRO</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">Owner Management</p>
            </div>
          </Link>
          <button 
            className="md:hidden text-slate-400 hover:text-white text-xl p-1"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            ✕
          </button>
        </div>

        {/* Navigation Items (Wrap SidebarNav in a div that closes menu on click in mobile) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700" onClick={() => {
          if (window.innerWidth < 768) setIsMobileMenuOpen(false)
        }}>
          <SidebarNav />
        </div>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center flex-shrink-0">
              {user.name ? user.name.charAt(0).toUpperCase() : "O"}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-slate-200 truncate">{user.name || "Restaurant Owner"}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main App Content Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200/80 h-14 flex items-center px-4 md:px-6 justify-between sticky top-0 z-30 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger Button */}
            <button 
              className="md:hidden text-slate-600 p-1 -ml-1 hover:bg-slate-100 rounded-lg"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="md:hidden flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-wider">
                RESTO<span className="text-indigo-600">PRO</span>
              </h1>
            </div>

            {/* Restaurant Store Status Indicator + Quick Toggle */}
            {restaurant && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs">
                  <span className={`w-2 h-2 rounded-full ${restaurant.is_open ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  <span className="font-medium text-slate-700">{restaurant.name}</span>
                  <span className="text-slate-400">•</span>
                  <span className={`font-semibold ${restaurant.is_open ? "text-emerald-700" : "text-rose-600"}`}>
                    {restaurant.is_open ? "Open" : "Closed"}
                  </span>
                </div>
                <StoreStatusToggle isOpen={restaurant.is_open} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile Store Status Toggle (Icon only) */}
            {restaurant && (
              <div className="sm:hidden scale-75 transform origin-right flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${restaurant.is_open ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                <StoreStatusToggle isOpen={restaurant.is_open} />
              </div>
            )}

            <Link
              href="/dev/create-order"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors border border-slate-200 whitespace-nowrap"
            >
              ⚡ POS
            </Link>

            <SignOutButton />
          </div>
        </header>

        {/* Page Main Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto bg-slate-50 w-full relative">
          {children}
        </main>
      </div>
    </div>
  )
}
