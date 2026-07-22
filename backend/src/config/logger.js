import winston from 'winston';

import env from './env.js';

// npm levels: error(0) < warn(1) < info(2) < http(3) < verbose(4) < debug(5).
// A level allows itself and everything MORE severe (lower number) through, so
// production must use 'http' (not 'info') or Morgan's access logs would be
// silently dropped.
const levelByEnv = {
  development: 'debug',
  production: 'http',
  test: 'warn',
};

const consoleFormat =
  env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        }),
      );

const logger = winston.createLogger({
  level: levelByEnv[env.NODE_ENV],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export default logger;
