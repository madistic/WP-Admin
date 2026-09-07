"use client"

import { signOut } from "next-auth/react"
import { useState } from "react"

export default function SignOutButton() {
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    if (loading) return
    setLoading(true)
    await signOut({ redirect: false, callbackUrl: "/login" })
    window.location.assign("/login")
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors px-2.5 py-1.5 rounded-md hover:bg-slate-100"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  )
}
