import designationService from './designation.service.js';

const create = async (req, res) => {
  const designation = await designationService.createDesignation(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ designation });
};

const list = async (req, res) => {
  const { designations, pagination } = await designationService.listDesignations(
    req.validatedQuery,
  );
  res.status(200).json({ designations, pagination });
};

const getById = async (req, res) => {
  const designation = await designationService.getDesignationById(req.params.id);
  res.status(200).json({ designation });
};

const update = async (req, res) => {
  const designation = await designationService.updateDesignation(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ designation });
};

const remove = async (req, res) => {
  await designationService.deleteDesignation(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Designation deleted successfully' });
};

export default { create, list, getById, update, remove };
