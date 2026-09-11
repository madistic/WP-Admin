import prisma from '../src/lib/prisma'

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      branches: true,
      _count: {
        select: {
          users: true,
          customers: true,
          orders: true,
        },
      },
    },
  })

  const data = restaurants.map((restaurant) => ({
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    branch_count: restaurant.branches.length,
    user_count: restaurant._count.users,
    customer_count: restaurant._count.customers,
    order_count: restaurant._count.orders,
    branches: restaurant.branches.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      is_active: branch.is_active,
    })),
  }))

  console.log(JSON.stringify(data, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
