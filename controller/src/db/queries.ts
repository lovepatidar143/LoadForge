import { pool, isDbConnected } from './connection';
import { TestConfig, TestResult, MetricsSnapshot, WorkerInfo } from '../types';
import { logger } from '../utils/logger';

export const dbQueries = {
  async saveTest(test: TestResult): Promise<void> {
    if (!isDbConnected) return;
    try {
      const query = `
        INSERT INTO tests (
          id, config, status, start_time, end_time, duration_seconds,
          total_requests, successful_requests, failed_requests, error_rate,
          mean_rps, peak_rps, total_bytes_sent, total_bytes_received,
          latency_min_ms, latency_max_ms, latency_mean_ms, latency_p50_ms,
          latency_p90_ms, latency_p95_ms, latency_p99_ms, latency_p999_ms,
          status_codes, errors, error_message, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          end_time = EXCLUDED.end_time,
          actual_duration_seconds = EXCLUDED.duration_seconds,
          total_requests = EXCLUDED.total_requests,
          successful_requests = EXCLUDED.successful_requests,
          failed_requests = EXCLUDED.failed_requests,
          error_rate = EXCLUDED.error_rate,
          mean_rps = EXCLUDED.mean_rps,
          peak_rps = EXCLUDED.peak_rps,
          total_bytes_sent = EXCLUDED.total_bytes_sent,
          total_bytes_received = EXCLUDED.total_bytes_received,
          latency_min_ms = EXCLUDED.latency_min_ms,
          latency_max_ms = EXCLUDED.latency_max_ms,
          latency_mean_ms = EXCLUDED.latency_mean_ms,
          latency_p50_ms = EXCLUDED.latency_p50_ms,
          latency_p90_ms = EXCLUDED.latency_p90_ms,
          latency_p95_ms = EXCLUDED.latency_p95_ms,
          latency_p99_ms = EXCLUDED.latency_p99_ms,
          latency_p999_ms = EXCLUDED.latency_p999_ms,
          status_codes = EXCLUDED.status_codes,
          errors = EXCLUDED.errors,
          error_message = EXCLUDED.error_message,
          updated_at = NOW();
      `;
      // Replace non-existent column "actual_duration_seconds" in ON CONFLICT to duration_seconds since actual_duration is not in schema directly but as duration_seconds
      const fixedQuery = query.replace('actual_duration_seconds =', 'duration_seconds =');

      await pool.query(fixedQuery, [
        test.testId, JSON.stringify(test.config), test.status, test.startTimeMs || null, test.endTimeMs || null, test.actualDurationSeconds || 0,
        test.totalRequests, test.successfulRequests, test.failedRequests, test.errorRate,
        test.meanRps, test.peakRps, test.totalBytesSent, test.totalBytesReceived,
        test.latency?.minMs || null, test.latency?.maxMs || null, test.latency?.meanMs || null, test.latency?.p50Ms || null,
        test.latency?.p90Ms || null, test.latency?.p95Ms || null, test.latency?.p99Ms || null, test.latency?.p999Ms || null,
        JSON.stringify(test.statusCodes || {}), JSON.stringify(test.errors || {}), test.errorMessage || null
      ]);
    } catch (err) {
      logger.error('Error saving test to DB', { error: err, testId: test.testId });
    }
  },

  async getTest(id: string): Promise<TestResult | null> {
    if (!isDbConnected) return null;
    try {
      const res = await pool.query('SELECT * FROM tests WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        testId: row.id,
        config: row.config as TestConfig,
        status: row.status,
        startTimeMs: Number(row.start_time),
        endTimeMs: Number(row.end_time),
        actualDurationSeconds: row.duration_seconds,
        totalRequests: Number(row.total_requests),
        successfulRequests: Number(row.successful_requests),
        failedRequests: Number(row.failed_requests),
        errorRate: row.error_rate,
        meanRps: row.mean_rps,
        peakRps: row.peak_rps,
        totalBytesSent: Number(row.total_bytes_sent),
        totalBytesReceived: Number(row.total_bytes_received),
        latency: {
          minMs: row.latency_min_ms,
          maxMs: row.latency_max_ms,
          meanMs: row.latency_mean_ms,
          p50Ms: row.latency_p50_ms,
          p90Ms: row.latency_p90_ms,
          p95Ms: row.latency_p95_ms,
          p99Ms: row.latency_p99_ms,
          p999Ms: row.latency_p999_ms,
        },
        statusCodes: row.status_codes || {},
        errors: row.errors || {},
        errorMessage: row.error_message,
        timeline: [] // Loaded separately if needed
      };
    } catch (err) {
      logger.error('Error getting test from DB', { error: err, id });
      return null;
    }
  },

  async listTests(page: number, limit: number): Promise<{tests: TestResult[], total: number}> {
    if (!isDbConnected) return { tests: [], total: 0 };
    try {
      const offset = (page - 1) * limit;
      const countRes = await pool.query('SELECT COUNT(*) FROM tests');
      const total = parseInt(countRes.rows[0].count, 10);

      const res = await pool.query('SELECT id, status, start_time, config FROM tests ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
      const tests = res.rows.map(row => ({
        testId: row.id,
        config: row.config,
        status: row.status,
        startTimeMs: Number(row.start_time)
      } as TestResult));

      return { tests, total };
    } catch (err) {
      logger.error('Error listing tests', { error: err });
      return { tests: [], total: 0 };
    }
  },

  async saveTimeline(snapshot: MetricsSnapshot): Promise<void> {
    if (!isDbConnected) return;
    try {
      await pool.query(`
        INSERT INTO test_timeline (
          test_id, timestamp_ms, worker_id, total_requests, successful_requests, failed_requests,
          current_rps, active_connections, latency_p50_ms, latency_p95_ms, latency_p99_ms,
          error_rate, worker_cpu_percent, worker_memory_mb
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        snapshot.testId, snapshot.timestampMs, snapshot.workerId, snapshot.totalRequests, snapshot.successfulRequests,
        snapshot.failedRequests, snapshot.currentRps, snapshot.activeConnections, snapshot.latency?.p50Ms || 0,
        snapshot.latency?.p95Ms || 0, snapshot.latency?.p99Ms || 0, 
        snapshot.totalRequests > 0 ? snapshot.failedRequests / snapshot.totalRequests : 0,
        snapshot.workerCpuPercent, snapshot.workerMemoryMb
      ]);
    } catch (err) {
      logger.error('Error saving timeline', { error: err });
    }
  },

  async getTimeline(testId: string): Promise<any[]> {
    if (!isDbConnected) return [];
    try {
      const res = await pool.query('SELECT * FROM test_timeline WHERE test_id = $1 ORDER BY timestamp_ms ASC', [testId]);
      return res.rows;
    } catch (err) {
      logger.error('Error getting timeline', { error: err, testId });
      return [];
    }
  },

  async updateWorker(worker: WorkerInfo): Promise<void> {
    if (!isDbConnected) return;
    try {
      await pool.query(`
        INSERT INTO workers (id, address, status, cpu_percent, memory_mb, last_heartbeat, current_test_id, registered_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
          address = EXCLUDED.address,
          status = EXCLUDED.status,
          cpu_percent = EXCLUDED.cpu_percent,
          memory_mb = EXCLUDED.memory_mb,
          last_heartbeat = EXCLUDED.last_heartbeat,
          current_test_id = EXCLUDED.current_test_id
      `, [worker.workerId, worker.address, worker.status, worker.cpuPercent, worker.memoryMb, worker.lastHeartbeatMs, worker.currentTestId]);
    } catch (err) {
      logger.error('Error updating worker in DB', { error: err, workerId: worker.workerId });
    }
  },

  async removeWorker(workerId: string): Promise<void> {
    if (!isDbConnected) return;
    try {
      await pool.query('DELETE FROM workers WHERE id = $1', [workerId]);
    } catch (err) {
      logger.error('Error removing worker from DB', { error: err, workerId });
    }
  }
};
