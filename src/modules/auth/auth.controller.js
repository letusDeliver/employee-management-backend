import authService from './auth.service.js';

const register = async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ message: 'User registered successfully', user });
};

const login = async (req, res) => {
  const user = await authService.login(req.body);
  res.status(200).json({ message: 'Login successful', user });
};

export default { register, login };
