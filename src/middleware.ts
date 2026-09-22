import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function middleware(req: NextRequest) {
  const token = await getToken({ req })

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const role = token.role as string

  // Restricted paths for BRANCH_STAFF
  const restrictedPaths = [
    "/branches",
    "/customers",
    "/categories",
    "/dashboard",
    "/settings",
    "/employees",
    "/api/branches",
    "/api/crm",
    "/api/customers",
    "/api/dashboard",
    "/api/menu/categories",
    "/api/restaurant"
  ]

  const isRestricted = restrictedPaths.some((p) => req.nextUrl.pathname.startsWith(p))
  
  // Also exactly "/" or "/dashboard"
  const isDashboardRoot = req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/dashboard"

  if (role === "BRANCH_STAFF" && (isRestricted || isDashboardRoot)) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.redirect(new URL("/orders", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/branches/:path*",
    "/customers/:path*",
    "/categories/:path*",
    "/settings/:path*",
    "/employees/:path*",
    "/",
    "/api/branches/:path*",
    "/api/crm/:path*",
    "/api/customers/:path*",
    "/api/dashboard/:path*",
    "/api/menu/categories/:path*",
    "/api/restaurant/:path*"
  ],
}
