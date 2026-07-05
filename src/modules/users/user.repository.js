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

export default { findByEmail, findById, create, findAll };
