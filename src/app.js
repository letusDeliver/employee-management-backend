import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import logger from './config/logger.js';
import router from './routes/index.js';
import notFoundMiddleware from './middlewares/notFound.middleware.js';
import errorMiddleware from './middlewares/error.middleware.js';
import BadRequestError from './errors/BadRequestError.js';

const app = express();

// Swagger UI's HTML page relies on inline <script>/<style> tags, which
// Helmet's default Content-Security-Policy blocks (a well-documented
// helmet + swagger-ui-express conflict) - relax CSP only for that one
// path, only when it's actually mounted, leaving every other response's
// CSP untouched.
app.use((req, res, next) => {
  if (env.ENABLE_SWAGGER && req.path.startsWith('/api-docs')) {
    return helmet({ contentSecurityPolicy: false })(req, res, next);
  }
  return helmet()(req, res, next);
});

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(cookieParser());

const morganStream = {
  write: (message) => logger.http(message.trim()),
};

// Always use 'combined' (uncolored) here - Winston's own console transport
// decides colorized-vs-JSON presentation; Morgan's colorized 'dev' format
// would otherwise leak raw ANSI escape codes into the JSON log files.
app.use(morgan('combined', { stream: morganStream }));

app.use(express.json());

// express.json() forwards a raw SyntaxError (not one of our AppError
// subclasses) when the request body isn't valid JSON. Translate it into a
// typed 400 here so malformed JSON doesn't fall through to the generic
// 500 path and leak an internal parser error message.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return next(new BadRequestError('Invalid JSON in request body'));
  }
  next(err);
});

app.use('/api/v1', router);

if (env.ENABLE_SWAGGER) {
  const { default: swaggerRouter } = await import('./docs/swagger.routes.js');
  app.use(swaggerRouter);
}

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
