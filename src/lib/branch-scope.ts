import prisma from "@/lib/prisma"

export type BranchScopeSession = {
  restaurant_id: string
  branch_id?: string | null
}

export async function getDefaultBranchId(restaurantId: string): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { restaurant_id: restaurantId, is_active: true },
    orderBy: { created_at: "asc" },
    select: { id: true },
  })

  return branch?.id ?? null
}

export async function resolveBranchIdForWrite(
  sessionUser: BranchScopeSession,
  preferredBranchId?: string | null
): Promise<string | null> {
  if (preferredBranchId) {
    return preferredBranchId
  }

  if (sessionUser.branch_id) {
    return sessionUser.branch_id
  }

  return await getDefaultBranchId(sessionUser.restaurant_id)
}

export function applyBranchScope(
  sessionUser: BranchScopeSession,
  where: Record<string, any> = {},
  branchIdOverride?: string | null
) {
  const branchId = branchIdOverride ?? sessionUser.branch_id

  return {
    ...where,
    restaurant_id: sessionUser.restaurant_id,
    ...(branchId ? { branch_id: branchId } : {}),
  }
}
