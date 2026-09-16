import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.offer.create({ data });
};

const findById = (id, client = prisma) => {
  return client.offer.findUnique({ where: { id } });
};

const findAllByApplicationId = (applicationId) => {
  return prisma.offer.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' } });
};

const update = (id, data, client = prisma) => {
  return client.offer.update({ where: { id }, data });
};

export default { create, findById, findAllByApplicationId, update };
