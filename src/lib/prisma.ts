import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool, PoolConfig } from 'pg'
import fs from 'fs'

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
  const isVerifyFull = connectionString?.includes('sslmode=verify-full')
  const isSslExplicit = isVerifyFull || connectionString?.includes('sslmode=require') || connectionString?.includes('sslmode=prefer') || connectionString?.includes('ssl=true')
  const useSsl = isSslExplicit || !isLocal

  const poolOptions: PoolConfig = {
    connectionString: connectionString || undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }

  if (isVerifyFull) {
    // For verify-full, look for CA bundle from PGSSLROOTCERT, NODE_EXTRA_CA_CERTS, or /app/certs/global-bundle.pem
    const caPath = process.env.PGSSLROOTCERT || process.env.NODE_EXTRA_CA_CERTS || '/app/certs/global-bundle.pem'
    if (caPath && fs.existsSync(caPath)) {
      poolOptions.ssl = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath, 'utf8'),
      }
    } else {
      // Let pg-connection-string read sslrootcert if present in connectionString, and enforce strict rejection
      poolOptions.ssl = { rejectUnauthorized: true }
    }
  } else if (useSsl && !connectionString?.includes('sslmode=disable')) {
    // Non-verify-full fallback (e.g. Render external database with proxy certificate)
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
