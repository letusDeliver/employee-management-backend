import candidateService from './candidate.service.js';

const create = async (req, res) => {
  const candidate = await candidateService.createCandidate(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ candidate });
};

const list = async (req, res) => {
  const result = await candidateService.listCandidates(req.query);
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const candidate = await candidateService.getCandidateById(req.params.id);
  res.status(200).json({ candidate });
};

const update = async (req, res) => {
  const candidate = await candidateService.updateCandidate(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ candidate });
};

const remove = async (req, res) => {
  await candidateService.deleteCandidate(req.params.id, { id: req.user.id, ipAddress: req.ip });
  res.status(200).json({ message: 'Candidate deleted successfully' });
};

export default { create, list, getById, update, remove };
