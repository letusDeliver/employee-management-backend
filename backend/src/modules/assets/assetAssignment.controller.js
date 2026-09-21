import assetAssignmentService from './assetAssignment.service.js';

const requesterFrom = (req) => ({
  id: req.user.id,
  ipAddress: req.ip,
  grantedPermissions: req.grantedPermissions,
});

const list = async (req, res) => {
  const result = await assetAssignmentService.listAssignments(req.validatedQuery, requesterFrom(req));
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const assignment = await assetAssignmentService.getAssignmentById(
    req.params.id,
    requesterFrom(req),
  );
  res.status(200).json({ assignment });
};

export default { list, getById };
