import BadRequestError from '../errors/BadRequestError.js';

// req.query has no setter under Express 5 (`req.query = ...` throws in
// strict-mode ES modules), so a validated query result can't overwrite
// req.query the way req.body can be overwritten - it lands on
// req.validatedQuery instead.
const validateMiddleware =
  (schema, target = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      return next(new BadRequestError(message));
    }

    if (target === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[target] = result.data;
    }

    next();
  };

export default validateMiddleware;
