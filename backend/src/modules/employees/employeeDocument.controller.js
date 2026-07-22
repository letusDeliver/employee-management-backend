import employeeDocumentService from './employeeDocument.service.js';

const upload = async (req, res) => {
  const document = await employeeDocumentService.uploadDocument(req.params.id, req.file, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ document });
};

const list = async (req, res) => {
  const documents = await employeeDocumentService.listDocuments(req.params.id, {
    id: req.user.id,
    grantedPermissions: req.grantedPermissions,
  });
  res.status(200).json({ documents });
};

const remove = async (req, res) => {
  await employeeDocumentService.deleteDocument(req.params.id, req.params.documentId, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Document deleted successfully' });
};

export default { upload, list, remove };
