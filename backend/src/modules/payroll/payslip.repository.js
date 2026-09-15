import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.payslip.create({ data });
};

const createLineItems = (items, client = prisma) => {
  return client.payslipLineItem.createMany({ data: items });
};

const findById = (id) => {
  return prisma.payslip.findUnique({ where: { id }, include: { lineItems: true } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.payslip.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.payslip.count({ where });
};

export default { create, createLineItems, findById, findAll, count };
