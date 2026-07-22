import env from './config/env.js';
import logger from './config/logger.js';
import app from './app.js';

const PORT = env.PORT;

const exitAfterFlush = (code) => {
  logger.once('finish', () => process.exit(code));
  logger.end();
};

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received: closing server gracefully`);
  server.close(() => {
    logger.info('Server closed');
    exitAfterFlush(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason : new Error(String(reason)));
  exitAfterFlush(1);
});

process.on('uncaughtException', (err) => {
  logger.error(err);
  exitAfterFlush(1);
});
