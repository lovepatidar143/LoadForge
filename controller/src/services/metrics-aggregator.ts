import { MetricsSnapshot } from '../types';
import { WorkerClient } from '../worker/worker-client';
import { logger } from '../utils/logger';

export class MetricsAggregator {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  public onMetricsUpdate: (testId: string, aggregated: MetricsSnapshot) => void = () => {};
  public onTestComplete: (testId: string) => void = () => {};

  startPolling(testId: string, workerAddresses: string[]): void {
    if (this.intervals.has(testId)) {
      this.stopPolling(testId);
    }

    const clients = workerAddresses.map(addr => new WorkerClient(addr));
    
    const intervalId = setInterval(async () => {
      try {
        const snapshots = await Promise.all(
          clients.map(client => client.getMetrics().catch(err => {
            logger.warn('Failed to get metrics from worker', { testId, error: err.message });
            return null;
          }))
        );

        const validSnapshots = snapshots.filter((s): s is MetricsSnapshot => s !== null);
        if (validSnapshots.length > 0) {
          const aggregated = MetricsAggregator.mergeSnapshots(validSnapshots);
          aggregated.testId = testId;
          this.onMetricsUpdate(testId, aggregated);
        }
      } catch (err: any) {
        logger.error('Error polling metrics', { testId, error: err.message });
      }
    }, 1000); // Poll every second

    this.intervals.set(testId, intervalId);
  }

  stopPolling(testId: string): void {
    const intervalId = this.intervals.get(testId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(testId);
    }
  }

  static mergeSnapshots(snapshots: MetricsSnapshot[]): MetricsSnapshot {
    if (snapshots.length === 0) throw new Error('Cannot merge empty snapshots');

    const merged: MetricsSnapshot = {
      workerId: 'aggregated',
      testId: snapshots[0].testId,
      timestampMs: Date.now(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      bytesSent: 0,
      bytesReceived: 0,
      currentRps: 0,
      activeConnections: 0,
      queueDepth: 0,
      statusCodes: {},
      errors: {},
      latency: {
        minMs: Number.MAX_VALUE,
        maxMs: 0,
        meanMs: 0,
        p50Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        p999Ms: 0
      },
      workerCpuPercent: 0,
      workerMemoryMb: 0
    };

    let totalLatencyMean = 0;
    
    for (const s of snapshots) {
      merged.totalRequests += s.totalRequests;
      merged.successfulRequests += s.successfulRequests;
      merged.failedRequests += s.failedRequests;
      merged.bytesSent += s.bytesSent;
      merged.bytesReceived += s.bytesReceived;
      merged.currentRps += s.currentRps;
      merged.activeConnections += s.activeConnections;
      merged.queueDepth += s.queueDepth;
      
      for (const [code, count] of Object.entries(s.statusCodes)) {
        merged.statusCodes[Number(code)] = (merged.statusCodes[Number(code)] || 0) + count;
      }
      
      for (const [error, count] of Object.entries(s.errors)) {
        merged.errors[error] = (merged.errors[error] || 0) + count;
      }

      // Simple max across workers for percentiles (not mathematically perfect, but standard approximation)
      if (s.latency) {
        merged.latency.minMs = Math.min(merged.latency.minMs, s.latency.minMs);
        merged.latency.maxMs = Math.max(merged.latency.maxMs, s.latency.maxMs);
        merged.latency.p50Ms = Math.max(merged.latency.p50Ms, s.latency.p50Ms);
        merged.latency.p90Ms = Math.max(merged.latency.p90Ms, s.latency.p90Ms);
        merged.latency.p95Ms = Math.max(merged.latency.p95Ms, s.latency.p95Ms);
        merged.latency.p99Ms = Math.max(merged.latency.p99Ms, s.latency.p99Ms);
        merged.latency.p999Ms = Math.max(merged.latency.p999Ms, s.latency.p999Ms);
        totalLatencyMean += (s.latency.meanMs * s.totalRequests);
      }

      merged.workerCpuPercent += s.workerCpuPercent;
      merged.workerMemoryMb += s.workerMemoryMb;
    }

    if (merged.totalRequests > 0) {
      merged.latency.meanMs = totalLatencyMean / merged.totalRequests;
    } else {
      merged.latency.minMs = 0;
    }

    // Average CPU/Memory across workers
    merged.workerCpuPercent /= snapshots.length;

    return merged;
  }
}
