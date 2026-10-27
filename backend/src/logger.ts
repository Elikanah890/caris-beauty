import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.pin',
      'req.body.newPassword',
      'req.body.currentPassword',
      'res.headers["set-cookie"]'
    ],
    censor: '[REDACTED]'
  }
});
