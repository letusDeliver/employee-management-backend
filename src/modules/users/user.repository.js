import prisma from '../../config/database.js';

const findByEmail = (email) => {
  return prisma.user.findUnique({ where: { email } });
};

const findById = (id) => {
  return prisma.user.findUnique({ where: { id } });
};

const create = (data) => {
  return prisma.user.create({ data });
};

export default { findByEmail, findById, create };
