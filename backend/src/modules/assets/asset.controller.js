import assetService from './asset.service.js';
import assetAssignmentService from './assetAssignment.service.js';

const actorFrom = (req) => ({ id: req.user.id, ipAddress: req.ip });

const create = async (req, res) => {
  const asset = await assetService.createAsset(req.body, actorFrom(req));
  res.status(201).json({ asset });
};

const list = async (req, res) => {
  const result = await assetService.listAssets(req.validatedQuery);
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const asset = await assetService.getAssetById(req.params.id);
  res.status(200).json({ asset });
};

const update = async (req, res) => {
  const asset = await assetService.updateAsset(req.params.id, req.body, actorFrom(req));
  res.status(200).json({ asset });
};

const remove = async (req, res) => {
  await assetService.deleteAsset(req.params.id, actorFrom(req));
  res.status(200).json({ message: 'Asset deleted successfully' });
};

const assign = async (req, res) => {
  const assignment = await assetAssignmentService.assignAsset(
    req.params.id,
    req.body,
    actorFrom(req),
  );
  res.status(201).json({ assignment });
};

const returnAsset = async (req, res) => {
  const assignment = await assetAssignmentService.returnAsset(
    req.params.id,
    req.body,
    actorFrom(req),
  );
  res.status(200).json({ assignment });
};

const getCurrentHolder = async (req, res) => {
  const assignment = await assetAssignmentService.getCurrentHolder(req.params.id);
  res.status(200).json({ assignment });
};

const listHistory = async (req, res) => {
  const assignments = await assetAssignmentService.listAssignmentHistory(req.params.id);
  res.status(200).json({ assignments });
};

export default {
  create,
  list,
  getById,
  update,
  remove,
  assign,
  returnAsset,
  getCurrentHolder,
  listHistory,
};
