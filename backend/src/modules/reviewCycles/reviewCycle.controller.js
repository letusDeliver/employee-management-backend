import reviewCycleService from './reviewCycle.service.js';

const create = async (req, res) => {
  const cycle = await reviewCycleService.createReviewCycle(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ cycle });
};

const list = async (req, res) => {
  const { cycles, pagination } = await reviewCycleService.listReviewCycles(req.validatedQuery);
  res.status(200).json({ cycles, pagination });
};

const getById = async (req, res) => {
  const cycle = await reviewCycleService.getReviewCycleById(req.params.id);
  res.status(200).json({ cycle });
};

const update = async (req, res) => {
  const cycle = await reviewCycleService.updateReviewCycle(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ cycle });
};

const remove = async (req, res) => {
  await reviewCycleService.deleteReviewCycle(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Review cycle deleted successfully' });
};

export default { create, list, getById, update, remove };
