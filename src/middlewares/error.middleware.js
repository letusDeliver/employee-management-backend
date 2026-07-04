import env from '../config/env.js';
import logger from '../config/logger.js';

const errorMiddleware = (err, req, res, _next) => {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  if (err.isOperational) {
    logger.warn(err.message);
  } else {
    logger.error(err);
  }

  const response = { status: 'error', message };

  if (env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

export default errorMiddleware;
