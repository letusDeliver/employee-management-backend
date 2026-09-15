import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.payrollRun.create({ data });
};

const findById = (id, client = prisma) => {
  return client.payrollRun.findUnique({ where: { id } });
};

const findByPeriod = (periodMonth, periodYear) => {
  return prisma.payrollRun.findUnique({
    where: { periodMonth_periodYear: { periodMonth, periodYear } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.payrollRun.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.payrollRun.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.payrollRun.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.payrollRun.delete({ where: { id } });
};

const countPayslips = (payrollRunId) => {
  return prisma.payslip.count({ where: { payrollRunId } });
};

export default {
  create,
  findById,
  findByPeriod,
  findAll,
  count,
  update,
  remove,
  countPayslips,
};
