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

const findAll = () => {
  return prisma.user.findMany();
};

export default { findByEmail, findById, create, findAll };
