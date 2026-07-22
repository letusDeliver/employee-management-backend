import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import env from './env.js';

const { PrismaClient } = prismaClientPkg;

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
