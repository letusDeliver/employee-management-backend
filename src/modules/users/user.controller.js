import userService from './user.service.js';

const list = async (req, res) => {
  const users = await userService.listUsers();
  res.status(200).json({ users });
};

export default { list };
