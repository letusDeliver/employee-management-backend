import attendanceService from './attendance.service.js';

const checkIn = async (req, res) => {
  const record = await attendanceService.checkIn({ id: req.user.id, ipAddress: req.ip });
  res.status(201).json({ record });
};

const checkOut = async (req, res) => {
  const record = await attendanceService.checkOut({ id: req.user.id, ipAddress: req.ip });
  res.status(200).json({ record });
};

const create = async (req, res) => {
  const record = await attendanceService.createAttendanceRecord(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ record });
};

const list = async (req, res) => {
  const { records, pagination } = await attendanceService.listAttendanceRecords(
    req.validatedQuery,
  );
  res.status(200).json({ records, pagination });
};

const getById = async (req, res) => {
  const record = await attendanceService.getAttendanceRecordById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ record });
};

const getEffectiveStatus = async (req, res) => {
  const result = await attendanceService.getEffectiveStatus(
    req.validatedQuery.employeeId,
    req.validatedQuery.date,
    { id: req.user.id, grantedPermissions: req.grantedPermissions },
  );
  res.status(200).json(result);
};

const update = async (req, res) => {
  const record = await attendanceService.updateAttendanceRecord(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ record });
};

const remove = async (req, res) => {
  await attendanceService.deleteAttendanceRecord(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Attendance record deleted successfully' });
};

export default { checkIn, checkOut, create, list, getById, getEffectiveStatus, update, remove };
