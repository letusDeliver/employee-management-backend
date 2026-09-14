import shiftService from './shift.service.js';

const create = async (req, res) => {
  const shift = await shiftService.createShift(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ shift });
};

const list = async (req, res) => {
  const { shifts, pagination } = await shiftService.listShifts(req.validatedQuery);
  res.status(200).json({ shifts, pagination });
};

const getById = async (req, res) => {
  const shift = await shiftService.getShiftById(req.params.id);
  res.status(200).json({ shift });
};

const update = async (req, res) => {
  const shift = await shiftService.updateShift(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ shift });
};

const remove = async (req, res) => {
  await shiftService.deleteShift(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Shift deleted successfully' });
};

export default { create, list, getById, update, remove };
