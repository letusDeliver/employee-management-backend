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

const app = express();

app.use(helmet());

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

app.use('/api/v1', router);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
