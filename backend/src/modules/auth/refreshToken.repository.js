import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.refreshToken.create({ data });
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

// The atomic "single use" guard for token rotation: revokes the token only if it
// is still active, in ONE statement, and reports whether THIS call did it. Two
// concurrent refreshes of the same token race on the row lock - the loser
// re-evaluates the WHERE clause against the winner's committed write and matches
// zero rows, so exactly one caller ever gets `true`. (A separate find-then-revoke
// would let both pass the check.)
const claimActiveByHash = async (tokenHash, client = prisma) => {
  const { count } = await client.refreshToken.updateMany({
    where: {
      tokenHash,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
    data: { revoked: true },
  });

  return count === 1;
};

const revoke = (id, client = prisma) => {
  return client.refreshToken.update({
    where: { id },
    data: { revoked: true },
  });
};

const revokeAllForUser = (userId, client = prisma) => {
  return client.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
};

export default { create, findValidByHash, claimActiveByHash, revoke, revokeAllForUser };
