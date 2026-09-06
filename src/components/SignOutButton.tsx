"use client"

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      onClick={() =>
        signOut({ callbackUrl: "/login" })
      }
      className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors px-2.5 py-1.5 rounded-md hover:bg-slate-100"
    >
      Sign out
    </button>
  )
}
