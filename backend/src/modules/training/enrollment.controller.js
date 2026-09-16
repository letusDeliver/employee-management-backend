import enrollmentService from './enrollment.service.js';
import enrollmentDocumentService from './enrollmentDocument.service.js';

const requesterFrom = (req) => ({
  id: req.user.id,
  ipAddress: req.ip,
  grantedPermissions: req.grantedPermissions,
});

const create = async (req, res) => {
  const enrollment = await enrollmentService.createEnrollment(req.body, requesterFrom(req));
  res.status(201).json({ enrollment });
};

const list = async (req, res) => {
  const result = await enrollmentService.listEnrollments(req.query, requesterFrom(req));
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const enrollment = await enrollmentService.getEnrollmentById(req.params.id, requesterFrom(req));
  res.status(200).json({ enrollment });
};

const updateStatus = async (req, res) => {
  const enrollment = await enrollmentService.updateEnrollmentStatus(
    req.params.id,
    req.body.status,
    req.body.score,
    requesterFrom(req),
  );
  res.status(200).json({ enrollment });
};

const remove = async (req, res) => {
  await enrollmentService.deleteEnrollment(req.params.id, requesterFrom(req));
  res.status(200).json({ message: 'Enrollment deleted successfully' });
};

const uploadDocument = async (req, res) => {
  const document = await enrollmentDocumentService.uploadDocument(
    req.params.id,
    req.file,
    requesterFrom(req),
  );
  res.status(201).json({ document });
};

const listDocuments = async (req, res) => {
  const documents = await enrollmentDocumentService.listDocuments(
    req.params.id,
    requesterFrom(req),
  );
  res.status(200).json({ documents });
};

const removeDocument = async (req, res) => {
  await enrollmentDocumentService.deleteDocument(
    req.params.id,
    req.params.documentId,
    requesterFrom(req),
  );
  res.status(200).json({ message: 'Document deleted successfully' });
};

const getCompliance = async (req, res) => {
  const result = await enrollmentService.getTrainingCompliance(
    req.query.employeeId,
    req.query.trainingProgramId,
    requesterFrom(req),
  );
  res.status(200).json({ compliance: result });
};

export default {
  create,
  list,
  getById,
  updateStatus,
  remove,
  uploadDocument,
  listDocuments,
  removeDocument,
  getCompliance,
};
