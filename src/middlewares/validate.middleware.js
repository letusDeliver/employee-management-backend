import BadRequestError from '../errors/BadRequestError.js';

const validateMiddleware = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    return next(new BadRequestError(message));
  }

  req.body = result.data;
  next();
};

export default validateMiddleware;
