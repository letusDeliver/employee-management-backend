import leaveTypeService from './leaveType.service.js';

const create = async (req, res) => {
  const leaveType = await leaveTypeService.createLeaveType(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ leaveType });
};

const list = async (req, res) => {
  const { leaveTypes, pagination } = await leaveTypeService.listLeaveTypes(req.validatedQuery);
  res.status(200).json({ leaveTypes, pagination });
};

const getById = async (req, res) => {
  const leaveType = await leaveTypeService.getLeaveTypeById(req.params.id);
  res.status(200).json({ leaveType });
};

const update = async (req, res) => {
  const leaveType = await leaveTypeService.updateLeaveType(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ leaveType });
};

const remove = async (req, res) => {
  await leaveTypeService.deleteLeaveType(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Leave type deleted successfully' });
};

export default { create, list, getById, update, remove };
