import departmentService from './department.service.js';

const create = async (req, res) => {
  const department = await departmentService.createDepartment(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ department });
};

const list = async (req, res) => {
  const { departments, pagination } = await departmentService.listDepartments(req.validatedQuery);
  res.status(200).json({ departments, pagination });
};

const getById = async (req, res) => {
  const department = await departmentService.getDepartmentById(req.params.id);
  res.status(200).json({ department });
};

const update = async (req, res) => {
  const department = await departmentService.updateDepartment(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ department });
};

const remove = async (req, res) => {
  await departmentService.deleteDepartment(req.params.id, { id: req.user.id, ipAddress: req.ip });
  res.status(200).json({ message: 'Department deleted successfully' });
};

export default { create, list, getById, update, remove };
