"use client"

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      onClick={() => {
        // Use window.location.origin so the callback URL is always relative to
        // the currently deployed host (Vercel, custom domain, or localhost)
        // instead of hardcoding NEXTAUTH_URL which may point to localhost.
        const loginUrl = `${window.location.origin}/login`
        signOut({ callbackUrl: loginUrl })
      }}
      className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors px-2.5 py-1.5 rounded-md hover:bg-slate-100"
    >
      Sign out
    </button>
  )
}
