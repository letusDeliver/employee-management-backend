import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.candidateDocument.create({ data });
};

const findAllByCandidateId = (candidateId) => {
  return prisma.candidateDocument.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
  });
};

const findById = (id, candidateId) => {
  return prisma.candidateDocument.findFirst({ where: { id, candidateId } });
};

const deleteById = (id, client = prisma) => {
  return client.candidateDocument.delete({ where: { id } });
};

export default { create, findAllByCandidateId, findById, deleteById };
