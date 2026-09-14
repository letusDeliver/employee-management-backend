import leaveService from './leave.service.js';

const create = async (req, res) => {
  const request = await leaveService.createLeaveRequest(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ request });
};

const list = async (req, res) => {
  const { requests, pagination } = await leaveService.listLeaveRequests(req.validatedQuery, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ requests, pagination });
};

const getById = async (req, res) => {
  const request = await leaveService.getLeaveRequestById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ request });
};

const approve = async (req, res) => {
  const request = await leaveService.approveLeaveRequest(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ request });
};

const reject = async (req, res) => {
  const request = await leaveService.rejectLeaveRequest(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ request });
};

const cancel = async (req, res) => {
  const request = await leaveService.cancelLeaveRequest(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ request });
};

const listBalances = async (req, res) => {
  const { balances, pagination } = await leaveService.listLeaveBalances(req.validatedQuery, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ balances, pagination });
};

const getBalanceById = async (req, res) => {
  const balance = await leaveService.getLeaveBalanceById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ balance });
};

const adjustBalance = async (req, res) => {
  const balance = await leaveService.adjustLeaveBalance(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ balance });
};

export default {
  create,
  list,
  getById,
  approve,
  reject,
  cancel,
  listBalances,
  getBalanceById,
  adjustBalance,
};
