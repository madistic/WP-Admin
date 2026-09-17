const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      branch_id: true,
      is_active: true,
    }
  })
  
  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      name: true
    }
  })

  console.log("USERS:")
  console.table(users.map(u => ({
    ...u,
    branchName: branches.find(b => b.id === u.branch_id)?.name || 'N/A'
  })))
}

main().catch(console.error).finally(() => prisma.$disconnect())
