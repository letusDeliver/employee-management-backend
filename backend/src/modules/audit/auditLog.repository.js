import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.auditLog.create({ data });
};

export default { create };
