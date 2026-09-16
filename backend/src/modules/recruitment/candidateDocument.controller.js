import candidateDocumentService from './candidateDocument.service.js';

const upload = async (req, res) => {
  const document = await candidateDocumentService.uploadDocument(req.params.id, req.file, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ document });
};

const list = async (req, res) => {
  const documents = await candidateDocumentService.listDocuments(req.params.id);
  res.status(200).json({ documents });
};

const remove = async (req, res) => {
  await candidateDocumentService.deleteDocument(req.params.id, req.params.documentId, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Document deleted successfully' });
};

export default { upload, list, remove };
