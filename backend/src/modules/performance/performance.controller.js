import performanceService from './performance.service.js';

const create = async (req, res) => {
  const review = await performanceService.createPerformanceReview(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(201).json({ review });
};

const list = async (req, res) => {
  const { reviews, pagination } = await performanceService.listPerformanceReviews(
    req.validatedQuery,
    { id: req.user.id, grantedPermissions: req.grantedPermissions },
  );
  res.status(200).json({ reviews, pagination });
};

const getById = async (req, res) => {
  const review = await performanceService.getPerformanceReviewById(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ review });
};

const update = async (req, res) => {
  const review = await performanceService.updatePerformanceReview(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ review });
};

const submit = async (req, res) => {
  const review = await performanceService.submitPerformanceReview(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ review });
};

const acknowledge = async (req, res) => {
  const review = await performanceService.acknowledgePerformanceReview(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ review });
};

const selfAssess = async (req, res) => {
  const review = await performanceService.setSelfAssessment(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ review });
};

const remove = async (req, res) => {
  await performanceService.deletePerformanceReview(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ message: 'Performance review deleted successfully' });
};

const addAddendum = async (req, res) => {
  const addendum = await performanceService.addAddendum(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(201).json({ addendum });
};

export default {
  create,
  list,
  getById,
  update,
  submit,
  acknowledge,
  selfAssess,
  remove,
  addAddendum,
};
