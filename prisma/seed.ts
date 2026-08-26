import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Clean up existing data (for development/reset purposes)
  await prisma.orderStatusHistory.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.menuItem.deleteMany()
  await prisma.menuCategory.deleteMany()
  await prisma.customerAddress.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.restaurant.deleteMany()

  // 1. Create a demo restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Spice Route',
      slug: 'spice-route',
      phone: '9876543210',
      whatsapp_number: '9876543210',
      email: 'hello@spiceroute.com',
      description: 'Authentic Indian cuisine delivered hot to your door.',
      address: '123 Food Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      delivery_radius: 10, // km
      minimum_order: 200, // ₹
      delivery_fee: 40, // ₹
      is_open: true,
    },
  })

  // 2. Create the owner
  const passwordHash = await bcrypt.hash('password123', 10)
  const owner = await prisma.user.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Restaurant Owner',
      email: 'admin@spiceroute.com',
      phone: '9999999999',
      password_hash: passwordHash,
      role: 'OWNER',
      is_active: true,
    },
  })

  // 3. Create Menu Categories
  const categoryMains = await prisma.menuCategory.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Main Course',
      sort_order: 1,
    },
  })

  const categorySides = await prisma.menuCategory.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Sides & Breads',
      sort_order: 2,
    },
  })

  // 4. Create Menu Items
  const item1 = await prisma.menuItem.create({
    data: {
      restaurant_id: restaurant.id,
      category_id: categoryMains.id,
      name: 'Chicken Biryani',
      description: 'Aromatic basmati rice cooked with tender chicken and authentic spices.',
      price: 280,
      is_available: true,
      is_veg: false,
      sort_order: 1,
    },
  })

  const item2 = await prisma.menuItem.create({
    data: {
      restaurant_id: restaurant.id,
      category_id: categoryMains.id,
      name: 'Paneer Butter Masala',
      description: 'Cottage cheese cubes in a rich tomato and butter gravy.',
      price: 250,
      is_available: true,
      is_veg: true,
      sort_order: 2,
    },
  })

  const item3 = await prisma.menuItem.create({
    data: {
      restaurant_id: restaurant.id,
      category_id: categorySides.id,
      name: 'Garlic Naan',
      description: 'Soft Indian bread with garlic and butter.',
      price: 60,
      is_available: true,
      is_veg: true,
      sort_order: 1,
    },
  })

  // 5. Create a demo customer
  const customer = await prisma.customer.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Rahul Sharma',
      phone: '+919812345678',
      whatsapp_number: '+919812345678',
    },
  })

  const address = await prisma.customerAddress.create({
    data: {
      customer_id: customer.id,
      address_line: 'A-402, Sunshine Apartments',
      landmark: 'Near City Mall',
      area: 'Andheri West',
      city: 'Mumbai',
      pincode: '400053',
    },
  })

  // 6. Create a sample order
  const order = await prisma.order.create({
    data: {
      order_number: 'ORD-1001',
      restaurant_id: restaurant.id,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      delivery_address_snapshot: `${address.address_line}, ${address.area}, ${address.city} - ${address.pincode}`,
      subtotal: 340, // 280 + 60
      delivery_fee: restaurant.delivery_fee,
      total: 340 + restaurant.delivery_fee,
      payment_method: 'COD',
      status: 'NEW',
      source: 'DEV_CRUD',
      items: {
        create: [
          {
            menu_item_id: item1.id,
            item_name_snapshot: item1.name,
            unit_price_snapshot: item1.price,
            quantity: 1,
            line_total: 280,
          },
          {
            menu_item_id: item3.id,
            item_name_snapshot: item3.name,
            unit_price_snapshot: item3.price,
            quantity: 1,
            line_total: 60,
          },
        ],
      },
      history: {
        create: {
          to_status: 'NEW',
          reason: 'Order created via seed script',
        },
      },
    },
  })

  console.log(`Demo Restaurant Created: ${restaurant.name}`)
  console.log(`Owner Login Email: admin@spiceroute.com | Password: password123`)
  console.log(`Sample Order created: ${order.order_number}`)
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
