import assert from 'assert';
import fetch from 'node-fetch';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

async function runTests() {
  const baseUrl = `http://localhost:${config.port}/api`;
  logger.info(`Running API tests against ${baseUrl}`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
    const healthData = await healthRes.json() as any;
    assert.strictEqual(healthData.status, 'ok', 'Health check status should be ok');
    logger.info('✅ Health check passed');

    // 2. Register worker
    const workerRes = await fetch(`${baseUrl}/workers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'test-worker-1', address: 'http://localhost:9090' })
    });
    assert.strictEqual(workerRes.status, 201, 'Worker registration should return 201');
    const workerData = await workerRes.json() as any;
    assert.strictEqual(workerData.workerId, 'test-worker-1', 'Worker ID should match');
    logger.info('✅ Worker registration passed');

    // 3. List workers
    const listRes = await fetch(`${baseUrl}/workers`);
    assert.strictEqual(listRes.status, 200, 'List workers should return 200');
    const workersList = await listRes.json() as any[];
    assert(workersList.some(w => w.workerId === 'test-worker-1'), 'Worker should be in the list');
    logger.info('✅ List workers passed');

    // 4. Create Test (This should fail if no targetUrl provided to test validation)
    const failTestRes = await fetch(`${baseUrl}/tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(failTestRes.status, 400, 'Invalid test config should return 400');
    logger.info('✅ Test validation passed');

    // 5. Remove worker
    const delRes = await fetch(`${baseUrl}/workers/test-worker-1`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200, 'Worker removal should return 200');
    logger.info('✅ Worker removal passed');

    logger.info('🎉 All tests passed successfully!');
    process.exit(0);
  } catch (err: any) {
    logger.error('❌ Test failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}
