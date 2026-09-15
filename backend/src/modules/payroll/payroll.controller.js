import payrollService from './payroll.service.js';

const create = async (req, res) => {
  const run = await payrollService.createPayrollRun(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ run });
};

const list = async (req, res) => {
  const { runs, pagination } = await payrollService.listPayrollRuns(req.validatedQuery);
  res.status(200).json({ runs, pagination });
};

const getById = async (req, res) => {
  const run = await payrollService.getPayrollRunById(req.params.id);
  res.status(200).json({ run });
};

const process = async (req, res) => {
  const run = await payrollService.processPayrollRun(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ run });
};

const finalize = async (req, res) => {
  const run = await payrollService.finalizePayrollRun(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ run });
};

const markPaid = async (req, res) => {
  const run = await payrollService.markPayrollRunPaid(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ run });
};

const remove = async (req, res) => {
  await payrollService.deletePayrollRun(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Payroll run deleted successfully' });
};

const listPayslips = async (req, res) => {
  const { payslips, pagination } = await payrollService.listPayslips(req.validatedQuery, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ payslips, pagination });
};

const getPayslipById = async (req, res) => {
  const payslip = await payrollService.getPayslipById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ payslip });
};

export default {
  create,
  list,
  getById,
  process,
  finalize,
  markPaid,
  remove,
  listPayslips,
  getPayslipById,
};
