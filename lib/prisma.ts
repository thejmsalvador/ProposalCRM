import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // DATABASE_URL points at Supabase's pooler in SESSION mode: pool_size 15 is
  // shared by every connected process (Next dev workers, Prisma Studio, seed
  // scripts), and each client connection holds a slot until it disconnects.
  // Keep the per-process pool well under 15 — queries beyond `max` queue
  // in-process instead of failing with EMAXCONNSESSION at the pooler.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
