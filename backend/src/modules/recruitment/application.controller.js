import applicationService from './application.service.js';

const actorFrom = (req) => ({ id: req.user.id, ipAddress: req.ip });

const create = async (req, res) => {
  const application = await applicationService.createApplication(req.body, actorFrom(req));
  res.status(201).json({ application });
};

const list = async (req, res) => {
  const result = await applicationService.listApplications(req.query);
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const application = await applicationService.getApplicationById(req.params.id);
  res.status(200).json({ application });
};

const updateStatus = async (req, res) => {
  const application = await applicationService.updateApplicationStatus(
    req.params.id,
    req.body.status,
    actorFrom(req),
  );
  res.status(200).json({ application });
};

const hire = async (req, res) => {
  const result = await applicationService.hireApplication(req.params.id, req.body, actorFrom(req));
  res.status(200).json(result);
};

const createInterview = async (req, res) => {
  const interview = await applicationService.createInterview(
    req.params.id,
    req.body,
    actorFrom(req),
  );
  res.status(201).json({ interview });
};

const listInterviews = async (req, res) => {
  const interviews = await applicationService.listInterviews(req.params.id);
  res.status(200).json({ interviews });
};

const updateInterview = async (req, res) => {
  const interview = await applicationService.updateInterview(
    req.params.id,
    req.params.interviewId,
    req.body,
    actorFrom(req),
  );
  res.status(200).json({ interview });
};

const deleteInterview = async (req, res) => {
  await applicationService.deleteInterview(req.params.id, req.params.interviewId, actorFrom(req));
  res.status(200).json({ message: 'Interview deleted successfully' });
};

const createOffer = async (req, res) => {
  const offer = await applicationService.createOffer(req.params.id, req.body, actorFrom(req));
  res.status(201).json({ offer });
};

const acceptOffer = async (req, res) => {
  const offer = await applicationService.acceptOffer(req.params.offerId, actorFrom(req));
  res.status(200).json({ offer });
};

const declineOffer = async (req, res) => {
  const offer = await applicationService.declineOffer(req.params.offerId, actorFrom(req));
  res.status(200).json({ offer });
};

const expireOffer = async (req, res) => {
  const offer = await applicationService.expireOffer(req.params.offerId, actorFrom(req));
  res.status(200).json({ offer });
};

export default {
  create,
  list,
  getById,
  updateStatus,
  hire,
  createInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  createOffer,
  acceptOffer,
  declineOffer,
  expireOffer,
};
