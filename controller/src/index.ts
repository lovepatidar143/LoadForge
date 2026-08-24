import express from 'express';
import * as http from 'http';
import cors from 'cors';
import { config } from './config';
import { initDb, isDbConnected } from './db/connection';
import { runMigrations } from './db/migrations';
import { createRouter } from './api/router';
import { errorHandler, requestLogger } from './api/middleware';
import { TestManager } from './services/test-manager';
import { WorkerManager } from './services/worker-manager';
import { MetricsAggregator } from './services/metrics-aggregator';
import { WebSocketHandler } from './websocket/handler';
import { getMetrics } from './prometheus/metrics';
import { logger } from './utils/logger';

async function bootstrap() {
  logger.info('Starting LoadForge Controller...');

  // DB
  await initDb();
  if (isDbConnected) {
    await runMigrations();
  }

  // Services
  const workerManager = new WorkerManager();
  const metricsAggregator = new MetricsAggregator();
  
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  const server = http.createServer(app);
  
  // WebSocket
  const wsHandler = new WebSocketHandler(server);
  
  const testManager = new TestManager(workerManager, metricsAggregator, wsHandler);

  // API
  app.use('/api', createRouter(testManager, workerManager));

  // Prometheus Metrics
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', 'text/plain');
      res.end(await getMetrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });

  app.use(errorHandler);

  workerManager.startHealthChecks();

  server.listen(config.port, () => {
    logger.info(`Controller API and WS listening on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    workerManager.stopHealthChecks();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    
    // Force close after 10s
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
  logger.error('Failed to start controller', { error: err.message, stack: err.stack });
  process.exit(1);
});
