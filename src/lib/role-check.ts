import { NextResponse } from "next/server"
import { Session } from "next-auth"
import { redirect } from "next/navigation"

/**
 * Checks if the user is an admin.
 * Use for API routes. Returns a NextResponse with 403 if forbidden.
 */
export function requireAdminApi(session: Session | null) {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role === "BRANCH_STAFF") {
    return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 })
  }
  return null
}

/**
 * Checks if the user is an admin.
 * Use for Page components. Redirects to /orders if forbidden.
 */
export function requireAdminPage(session: Session | null) {
  if (!session?.user) {
    redirect("/login")
  }
  if (session.user.role === "BRANCH_STAFF") {
    redirect("/orders")
  }
}
