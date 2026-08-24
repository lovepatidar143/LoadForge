import { v4 as uuidv4 } from 'uuid';
import { TestConfig, TestResult, MetricsSnapshot, TestStatus } from '../types';
import { WorkerManager } from './worker-manager';
import { MetricsAggregator } from './metrics-aggregator';
import { dbQueries } from '../db/queries';
import { WorkerClient } from '../worker/worker-client';
import { logger } from '../utils/logger';
import { WebSocketHandler } from '../websocket/handler';
import { metrics } from '../prometheus/metrics';

export class TestManager {
  private activeTests: Map<string, TestResult> = new Map();

  constructor(
    private workerManager: WorkerManager,
    private metricsAggregator: MetricsAggregator,
    private wsHandler: WebSocketHandler
  ) {
    this.metricsAggregator.onMetricsUpdate = this.handleMetricsUpdate.bind(this);
    this.metricsAggregator.onTestComplete = this.onTestComplete.bind(this);
  }

  async createTest(config: Partial<TestConfig>): Promise<TestResult> {
    const testId = uuidv4();
    const fullConfig: TestConfig = {
      testId,
      targetUrl: config.targetUrl || '',
      method: config.method || 'GET',
      headers: config.headers || {},
      body: config.body || '',
      requestsPerSecond: config.requestsPerSecond || 0,
      concurrency: config.concurrency || 10,
      durationSeconds: config.durationSeconds || 60,
      rampUpSeconds: config.rampUpSeconds || 0,
      rampDownSeconds: config.rampDownSeconds || 0,
      timeoutMs: config.timeoutMs || 5000,
      keepAlive: config.keepAlive ?? true,
      maxConnections: config.maxConnections || 100
    };

    if (!fullConfig.targetUrl) throw new Error('Target URL is required');

    const result: TestResult = {
      testId,
      config: fullConfig,
      startTimeMs: 0,
      endTimeMs: 0,
      actualDurationSeconds: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errorRate: 0,
      meanRps: 0,
      peakRps: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      latency: { minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0, p999Ms: 0 },
      statusCodes: {},
      errors: {},
      timeline: [],
      status: 'pending'
    };

    await dbQueries.saveTest(result);
    this.activeTests.set(testId, result);
    
    // Start asynchronously
    this.startTest(testId).catch(err => {
      logger.error('Failed to start test', { testId, error: err.message });
      this.markTestFailed(testId, err.message);
    });

    metrics.testsTotal.inc();
    return result;
  }

  private async startTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    const availableWorkers = this.workerManager.getAvailableWorkers();
    if (availableWorkers.length === 0) {
      throw new Error('No available workers to run the test');
    }

    test.status = 'running';
    test.startTimeMs = Date.now();
    await dbQueries.saveTest(test);
    
    this.wsHandler.broadcast('test_started', { testId, config: test.config });
    metrics.testsActive.inc();
    metrics.workersActive.set(availableWorkers.length);

    const workerCount = availableWorkers.length;
    // Split the load among workers
    const rpsPerWorker = test.config.requestsPerSecond > 0 ? Math.ceil(test.config.requestsPerSecond / workerCount) : 0;
    const concurrencyPerWorker = Math.max(1, Math.floor(test.config.concurrency / workerCount));

    const workerAddresses: string[] = [];

    for (const worker of availableWorkers) {
      const workerConfig = { ...test.config, requestsPerSecond: rpsPerWorker, concurrency: concurrencyPerWorker };
      const client = new WorkerClient(worker.address);
      const res = await client.startTest(workerConfig);
      
      if (!res.success) {
        logger.error('Worker failed to start test', { workerId: worker.workerId, error: res.message });
      } else {
        workerAddresses.push(worker.address);
        this.workerManager.updateWorkerStatus(worker.workerId, { status: 'running', currentTestId: testId });
      }
    }

    if (workerAddresses.length === 0) {
      throw new Error('All workers failed to start the test');
    }

    this.metricsAggregator.startPolling(testId, workerAddresses);

    // Schedule stop
    setTimeout(() => {
      this.stopTest(testId).catch(err => logger.error('Error auto-stopping test', err));
    }, test.config.durationSeconds * 1000 + 2000); // add 2s buffer
  }

  async stopTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test || (test.status !== 'running' && test.status !== 'pending')) {
      const dbTest = await dbQueries.getTest(testId);
      if (dbTest && dbTest.status === 'running') {
        // Handle case where controller restarted but test is marked running in DB
        dbTest.status = 'cancelled';
        await dbQueries.saveTest(dbTest);
      }
      return;
    }

    this.metricsAggregator.stopPolling(testId);

    const workers = this.workerManager.getWorkers().filter(w => w.currentTestId === testId);
    for (const worker of workers) {
      const client = new WorkerClient(worker.address);
      await client.stopTest(testId).catch(err => logger.error('Failed to stop worker test', err));
      this.workerManager.updateWorkerStatus(worker.workerId, { status: 'idle', currentTestId: undefined });
    }

    test.status = test.status === 'running' && (Date.now() - test.startTimeMs >= test.config.durationSeconds * 1000) 
      ? 'completed' 
      : 'cancelled';
    
    await this.onTestComplete(testId);
  }

  async getTest(testId: string): Promise<TestResult | null> {
    if (this.activeTests.has(testId)) {
      return this.activeTests.get(testId)!;
    }
    return await dbQueries.getTest(testId);
  }

  async listTests(page: number, limit: number): Promise<{tests: TestResult[], total: number}> {
    return await dbQueries.listTests(page, limit);
  }

  handleMetricsUpdate(testId: string, snapshot: MetricsSnapshot): void {
    const test = this.activeTests.get(testId);
    if (!test) return;

    test.timeline.push(snapshot);
    // Keep max 1000 points in memory to avoid OOM
    if (test.timeline.length > 1000) {
      test.timeline.shift();
    }
    
    // Update live aggregates
    test.totalRequests = snapshot.totalRequests;
    test.successfulRequests = snapshot.successfulRequests;
    test.failedRequests = snapshot.failedRequests;
    test.currentRps = snapshot.currentRps;
    test.meanRps = (test.meanRps * (test.timeline.length - 1) + snapshot.currentRps) / test.timeline.length;
    test.peakRps = Math.max(test.peakRps, snapshot.currentRps);
    test.errorRate = test.totalRequests > 0 ? test.failedRequests / test.totalRequests : 0;
    
    this.wsHandler.broadcast('metrics_update', snapshot);
    dbQueries.saveTimeline(snapshot).catch(err => logger.error('DB timeline error', err));
  }

  private async markTestFailed(testId: string, errorMessage: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;
    test.status = 'failed';
    test.errorMessage = errorMessage;
    await this.onTestComplete(testId);
  }

  private async onTestComplete(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    test.endTimeMs = Date.now();
    test.actualDurationSeconds = Math.floor((test.endTimeMs - test.startTimeMs) / 1000);
    
    // Process final metrics here from timeline
    if (test.timeline.length > 0) {
      const last = test.timeline[test.timeline.length - 1];
      test.latency = last.latency;
      test.statusCodes = last.statusCodes;
      test.errors = last.errors;
      test.totalBytesSent = last.bytesSent;
      test.totalBytesReceived = last.bytesReceived;
    }

    await dbQueries.saveTest(test);
    this.activeTests.delete(testId);
    
    this.wsHandler.broadcast('test_completed', test);
    metrics.testsActive.dec();
    
    // Reset workers
    const workers = this.workerManager.getWorkers().filter(w => w.currentTestId === testId);
    for (const worker of workers) {
      this.workerManager.updateWorkerStatus(worker.workerId, { status: 'idle', currentTestId: undefined });
    }
    metrics.workersActive.set(this.workerManager.getWorkers().filter(w => w.status === 'running').length);
  }
}
