import * as promClient from 'prom-client';

// Initialize default metrics (CPU, Memory, etc. of the controller itself)
promClient.collectDefaultMetrics({ prefix: 'loadforge_controller_' });

export const metrics = {
  testsTotal: new promClient.Counter({
    name: 'loadforge_tests_total',
    help: 'Total tests run'
  }),
  testsActive: new promClient.Gauge({
    name: 'loadforge_tests_active',
    help: 'Currently running tests'
  }),
  requestsTotal: new promClient.Counter({
    name: 'loadforge_requests_total',
    help: 'Total requests across all tests',
    labelNames: ['status']
  }),
  requestDurationMs: new promClient.Histogram({
    name: 'loadforge_request_duration_ms',
    help: 'Request latency',
    buckets: [10, 50, 100, 250, 500, 1000, 2000, 5000]
  }),
  workersTotal: new promClient.Gauge({
    name: 'loadforge_workers_total',
    help: 'Total registered workers'
  }),
  workersActive: new promClient.Gauge({
    name: 'loadforge_workers_active',
    help: 'Workers currently running tests'
  }),
  errorsTotal: new promClient.Counter({
    name: 'loadforge_errors_total',
    help: 'Total errors by type',
    labelNames: ['type']
  })
};

export const getMetrics = async () => {
  return await promClient.register.metrics();
};
