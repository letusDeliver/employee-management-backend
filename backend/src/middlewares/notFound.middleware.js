import NotFoundError from '../errors/NotFoundError.js';

const notFoundMiddleware = (req, res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

export default notFoundMiddleware;
