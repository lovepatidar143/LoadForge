import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  wsPort: parseInt(process.env.WS_PORT || '3002'),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'loadforge',
    user: process.env.DB_USER || 'loadforge',
    password: process.env.DB_PASSWORD || 'loadforge',
  },
  workerPollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000'),
  workerHealthTimeoutMs: parseInt(process.env.WORKER_HEALTH_TIMEOUT_MS || '10000'),
  metricsRetentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
};
