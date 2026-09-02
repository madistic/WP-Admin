import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
  const isSslExplicit = connectionString?.includes('sslmode=require') || connectionString?.includes('sslmode=prefer') || connectionString?.includes('ssl=true')
  const useSsl = isSslExplicit || (process.env.NODE_ENV === 'production' && !isLocal)

  const poolOptions: any = {
    connectionString: connectionString || undefined,
  }

  if (useSsl) {
    poolOptions.ssl = { rejectUnauthorized: false }
  }

  const pool = new Pool(poolOptions)

  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
