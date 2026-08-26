"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { name: "Analytics & Reports", href: "/dashboard", icon: "📊" },
  { name: "Orders", href: "/orders", icon: "📦" },
  { name: "Customers", href: "/customers", icon: "👥" },
  { name: "Menu", href: "/menu", icon: "🍽️" },
  { name: "History", href: "/history", icon: "📜" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
]

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
          (item.href === "/dashboard" && pathname === "/")

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? "bg-indigo-600/90 text-white font-semibold shadow-sm"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
