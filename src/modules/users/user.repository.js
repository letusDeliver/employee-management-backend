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

const findAll = (client = prisma) => {
  return client.user.findMany();
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

export default { findByEmail, findById, create, findAll, updateProfileImage, clearProfileImage };
