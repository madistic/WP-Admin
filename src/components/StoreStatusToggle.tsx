"use client"

import { useState, useTransition } from "react"

export default function StoreStatusToggle({ isOpen }: { isOpen: boolean }) {
  const [open, setOpen] = useState(isOpen)
  const [isPending, startTransition] = useTransition()

  async function toggle() {
    const newStatus = !open
    startTransition(async () => {
      try {
        const res = await fetch("/api/restaurant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_open: newStatus }),
        })
        if (res.ok) {
          setOpen(newStatus)
        }
      } catch (err) {
        console.error("Store status toggle failed", err)
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors shadow-xs border ${
        open
          ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
          : "bg-rose-600 hover:bg-rose-700 text-white border-rose-700"
      } disabled:opacity-60`}
      title={open ? "Click to close restaurant" : "Click to open restaurant"}
    >
      {isPending ? "…" : open ? "🟢 Open" : "🔴 Closed"}
    </button>
  )
}
