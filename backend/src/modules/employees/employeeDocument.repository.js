import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.employeeDocument.create({ data });
};

const findAllByEmployeeId = (employeeId) => {
  return prisma.employeeDocument.findMany({
    where: { employeeId, employee: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
  });
};

const findById = (id, employeeId) => {
  return prisma.employeeDocument.findFirst({
    where: { id, employeeId, employee: { deletedAt: null } },
  });
};

const deleteById = (id, client = prisma) => {
  return client.employeeDocument.delete({ where: { id } });
};

export default { create, findAllByEmployeeId, findById, deleteById };
