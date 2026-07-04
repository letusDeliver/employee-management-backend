import prisma from '../../config/database.js';

const create = (data) => {
  return prisma.refreshToken.create({ data });
};

const findValidByHash = (tokenHash) => {
  return prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
  });
};

const revoke = (id) => {
  return prisma.refreshToken.update({
    where: { id },
    data: { revoked: true },
  });
};

export default { create, findValidByHash, revoke };
