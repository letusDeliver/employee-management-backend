import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.interview.create({ data });
};

const findById = (id, applicationId) => {
  return prisma.interview.findFirst({ where: { id, applicationId } });
};

const findAllByApplicationId = (applicationId) => {
  return prisma.interview.findMany({ where: { applicationId }, orderBy: { scheduledAt: 'asc' } });
};

const update = (id, data, client = prisma) => {
  return client.interview.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.interview.delete({ where: { id } });
};

export default { create, findById, findAllByApplicationId, update, remove };
