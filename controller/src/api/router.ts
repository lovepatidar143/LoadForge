import { Router } from 'express';
import { TestManager } from '../services/test-manager';
import { WorkerManager } from '../services/worker-manager';
import { NotFoundError, ValidationError } from '../utils/errors';

export const createRouter = (testManager: TestManager, workerManager: WorkerManager): Router => {
  const router = Router();

  // Tests
  router.post('/tests', async (req, res, next) => {
    try {
      const config = req.body;
      if (!config.targetUrl) throw new ValidationError('targetUrl is required');
      const test = await testManager.createTest(config);
      res.status(201).json(test);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tests', async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await testManager.listTests(page, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tests/:id', async (req, res, next) => {
    try {
      const test = await testManager.getTest(req.params.id);
      if (!test) throw new NotFoundError('Test not found');
      res.json(test);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tests/:id', async (req, res, next) => {
    try {
      await testManager.stopTest(req.params.id);
      res.json({ message: 'Test stopped/cancelled' });
    } catch (err) {
      next(err);
    }
  });

  // Workers
  router.post('/workers/register', (req, res) => {
    const { workerId, address } = req.body;
    if (!workerId || !address) throw new ValidationError('workerId and address are required');
    const worker = workerManager.register(workerId, address);
    res.status(201).json(worker);
  });

  router.get('/workers', (req, res) => {
    res.json(workerManager.getWorkers());
  });

  router.delete('/workers/:id', (req, res) => {
    workerManager.remove(req.params.id);
    res.json({ message: 'Worker removed' });
  });

  // System
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/stats', async (req, res) => {
    res.json({
      workers: workerManager.getWorkers().length,
      availableWorkers: workerManager.getAvailableWorkers().length
    });
  });

  return router;
};
