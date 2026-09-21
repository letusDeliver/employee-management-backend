import exitCaseService from './exitCase.service.js';

const requesterFrom = (req) => ({
  id: req.user.id,
  ipAddress: req.ip,
  grantedPermissions: req.grantedPermissions,
});

const create = async (req, res) => {
  const exitCase = await exitCaseService.createExitCase(req.body, requesterFrom(req));
  res.status(201).json({ exitCase });
};

const list = async (req, res) => {
  const result = await exitCaseService.listExitCases(req.validatedQuery, requesterFrom(req));
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const exitCase = await exitCaseService.getExitCaseById(req.params.id, requesterFrom(req));
  res.status(200).json({ exitCase });
};

const update = async (req, res) => {
  const exitCase = await exitCaseService.updateExitCase(
    req.params.id,
    req.body,
    requesterFrom(req),
  );
  res.status(200).json({ exitCase });
};

const withdraw = async (req, res) => {
  const exitCase = await exitCaseService.withdrawExitCase(req.params.id, requesterFrom(req));
  res.status(200).json({ exitCase });
};

const separate = async (req, res) => {
  const exitCase = await exitCaseService.separateExitCase(
    req.params.id,
    req.body,
    requesterFrom(req),
  );
  res.status(200).json({ exitCase });
};

const processDue = async (req, res) => {
  const result = await exitCaseService.processDueSeparations(requesterFrom(req));
  res.status(200).json(result);
};

const addClearanceItem = async (req, res) => {
  const clearanceItem = await exitCaseService.addClearanceItem(
    req.params.id,
    req.body,
    requesterFrom(req),
  );
  res.status(201).json({ clearanceItem });
};

const updateClearanceItem = async (req, res) => {
  const result = await exitCaseService.updateClearanceItem(
    req.params.id,
    req.params.itemId,
    req.body,
    requesterFrom(req),
  );
  res.status(200).json(result);
};

export default {
  create,
  list,
  getById,
  update,
  withdraw,
  separate,
  processDue,
  addClearanceItem,
  updateClearanceItem,
};
