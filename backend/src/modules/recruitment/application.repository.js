import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.application.create({ data });
};

const findById = (id, client = prisma) => {
  return client.application.findUnique({
    where: { id },
    include: {
      candidate: true,
      jobRequisition: true,
      interviews: { orderBy: { scheduledAt: 'asc' } },
      offers: { orderBy: { createdAt: 'desc' } },
    },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.application.findMany({
    where,
    orderBy,
    skip,
    take,
    include: { candidate: true, jobRequisition: true },
  });
};

const count = (where = {}) => {
  return prisma.application.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.application.update({ where: { id }, data });
};

export default { create, findById, findAll, count, update };
