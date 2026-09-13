import branchService from './branch.service.js';

const create = async (req, res) => {
  const branch = await branchService.createBranch(req.body, { id: req.user.id, ipAddress: req.ip });
  res.status(201).json({ branch });
};

const list = async (req, res) => {
  const { branches, pagination } = await branchService.listBranches(req.validatedQuery);
  res.status(200).json({ branches, pagination });
};

const getById = async (req, res) => {
  const branch = await branchService.getBranchById(req.params.id);
  res.status(200).json({ branch });
};

const update = async (req, res) => {
  const branch = await branchService.updateBranch(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ branch });
};

const remove = async (req, res) => {
  await branchService.deleteBranch(req.params.id, { id: req.user.id, ipAddress: req.ip });
  res.status(200).json({ message: 'Branch deleted successfully' });
};

export default { create, list, getById, update, remove };
