import userService from './user.service.js';

const list = async (req, res) => {
  const { users, pagination } = await userService.listUsers(req.validatedQuery);
  res.status(200).json({ users, pagination });
};

const uploadProfilePicture = async (req, res) => {
  const user = await userService.uploadProfilePicture(req.user.id, req.file, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ user });
};

const deleteProfilePicture = async (req, res) => {
  const user = await userService.deleteProfilePicture(req.user.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ user });
};

export default { list, uploadProfilePicture, deleteProfilePicture };
