import prisma from '../../config/database.js';

const findByEmail = (email, client = prisma) => {
  return client.user.findUnique({ where: { email } });
};

const findById = (id, client = prisma) => {
  return client.user.findUnique({ where: { id } });
};

const create = (data, client = prisma) => {
  return client.user.create({ data });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.user.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.user.count({ where });
};

const updateProfileImage = (userId, { url, publicId }, client = prisma) => {
  return client.user.update({
    where: { id: userId },
    data: { profileImageUrl: url, profileImagePublicId: publicId },
  });
};

const clearProfileImage = (userId, client = prisma) => {
  return client.user.update({
    where: { id: userId },
    data: { profileImageUrl: null, profileImagePublicId: null },
  });
};

// Narrow `select` on purpose - this runs on every authenticated request
// (authMiddleware), so it should never pull the password hash or any other
// column into memory just to check one timestamp. Returns `undefined` (not
// `null`) when the user no longer exists at all, so authMiddleware can tell
// "no invalidation stamped" apart from "this account is gone" - a deleted
// user's still-unexpired access token must never be trusted just because it
// happens to predate a tokensValidAfter that was never set.
const getTokensValidAfter = async (id, client = prisma) => {
  const user = await client.user.findUnique({ where: { id }, select: { tokensValidAfter: true } });
  return user ? (user.tokensValidAfter ?? null) : undefined;
};

const invalidateTokensIssuedBefore = (userId, timestamp, client = prisma) => {
  return client.user.update({
    where: { id: userId },
    data: { tokensValidAfter: timestamp },
  });
};

export default {
  findByEmail,
  findById,
  create,
  findAll,
  count,
  updateProfileImage,
  clearProfileImage,
  getTokensValidAfter,
  invalidateTokensIssuedBefore,
};
