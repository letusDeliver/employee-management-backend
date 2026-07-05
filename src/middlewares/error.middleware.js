import multer from 'multer';

import env from '../config/env.js';
import logger from '../config/logger.js';
import BadRequestError from '../errors/BadRequestError.js';

// Multer's own errors (file too large, too many files, etc.) aren't one of
// our AppError subclasses - translated here into a typed 400, same
// treatment as app.js's JSON-syntax-error translator. A fileFilter
// rejection (wrong MIME type) already throws our own BadRequestError
// directly and never reaches this branch at all.
const MULTER_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: 'File exceeds the maximum allowed size',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

const translateKnownErrors = (err) => {
  if (err instanceof multer.MulterError) {
    return new BadRequestError(
      MULTER_ERROR_MESSAGES[err.code] ?? `File upload error: ${err.message}`,
    );
  }

  return err;
};

const errorMiddleware = (rawErr, req, res, _next) => {
  const err = translateKnownErrors(rawErr);
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
