import employeeService from './employee.service.js';

const create = async (req, res) => {
  const employee = await employeeService.createEmployee(req.body);
  res.status(201).json({ employee });
};

const list = async (req, res) => {
  const employees = await employeeService.listEmployees();
  res.status(200).json({ employees });
};

const getById = async (req, res) => {
  const employee = await employeeService.getEmployeeById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ employee });
};

const update = async (req, res) => {
  const employee = await employeeService.updateEmployee(req.params.id, req.body);
  res.status(200).json({ employee });
};

const remove = async (req, res) => {
  await employeeService.softDeleteEmployee(req.params.id);
  res.status(200).json({ message: 'Employee deleted successfully' });
};

export default { create, list, getById, update, remove };
