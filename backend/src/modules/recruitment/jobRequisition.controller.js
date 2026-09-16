import jobRequisitionService from './jobRequisition.service.js';

const create = async (req, res) => {
  const requisition = await jobRequisitionService.createJobRequisition(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ jobRequisition: requisition });
};

const list = async (req, res) => {
  const result = await jobRequisitionService.listJobRequisitions(req.query);
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const requisition = await jobRequisitionService.getJobRequisitionById(req.params.id);
  res.status(200).json({ jobRequisition: requisition });
};

const updateStatus = async (req, res) => {
  const requisition = await jobRequisitionService.updateJobRequisitionStatus(
    req.params.id,
    req.body.status,
    { id: req.user.id, ipAddress: req.ip },
  );
  res.status(200).json({ jobRequisition: requisition });
};

const remove = async (req, res) => {
  await jobRequisitionService.deleteJobRequisition(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Job requisition deleted successfully' });
};

export default { create, list, getById, updateStatus, remove };
