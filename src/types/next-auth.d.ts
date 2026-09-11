import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      restaurant_id: string
      branch_id?: string | null
      role: string
    } & DefaultSession["user"]
  }

  interface User {
    restaurant_id: string
    branch_id?: string | null
    role: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    restaurant_id: string
    branch_id?: string | null
    role: string
  }
}
