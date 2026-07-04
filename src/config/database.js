import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = prismaClientPkg;

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
