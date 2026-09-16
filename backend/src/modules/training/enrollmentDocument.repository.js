import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.enrollmentDocument.create({ data });
};

const findAllByEnrollmentId = (enrollmentId) => {
  return prisma.enrollmentDocument.findMany({
    where: { enrollmentId },
    orderBy: { createdAt: 'desc' },
  });
};

const findById = (id, enrollmentId) => {
  return prisma.enrollmentDocument.findFirst({ where: { id, enrollmentId } });
};

const deleteById = (id, client = prisma) => {
  return client.enrollmentDocument.delete({ where: { id } });
};

export default { create, findAllByEnrollmentId, findById, deleteById };
