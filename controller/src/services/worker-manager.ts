import { WorkerInfo } from '../types';
import { dbQueries } from '../db/queries';
import { WorkerClient } from '../worker/worker-client';
import { config } from '../config';
import { logger } from '../utils/logger';

export class WorkerManager {
  private workers: Map<string, WorkerInfo> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  register(workerId: string, address: string): WorkerInfo {
    const worker: WorkerInfo = {
      workerId,
      address,
      status: 'idle',
      cpuPercent: 0,
      memoryMb: 0,
      lastHeartbeatMs: Date.now()
    };
    this.workers.set(workerId, worker);
    dbQueries.updateWorker(worker).catch(err => logger.error('DB error', err));
    logger.info(`Worker registered: ${workerId} at ${address}`);
    return worker;
  }

  remove(workerId: string): void {
    this.workers.delete(workerId);
    dbQueries.removeWorker(workerId).catch(err => logger.error('DB error', err));
    logger.info(`Worker removed: ${workerId}`);
  }

  getWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  getAvailableWorkers(): WorkerInfo[] {
    const now = Date.now();
    return this.getWorkers().filter(w => 
      w.status === 'idle' && 
      (now - w.lastHeartbeatMs) < config.workerHealthTimeoutMs
    );
  }

  updateWorkerStatus(workerId: string, statusInfo: Partial<WorkerInfo>): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      Object.assign(worker, statusInfo);
      worker.lastHeartbeatMs = Date.now();
      dbQueries.updateWorker(worker).catch(err => logger.error('DB error', err));
    }
  }

  startHealthChecks(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      const workers = this.getWorkers();
      const now = Date.now();

      for (const worker of workers) {
        if (now - worker.lastHeartbeatMs > config.workerHealthTimeoutMs) {
          logger.warn(`Worker offline: ${worker.workerId}`);
          this.updateWorkerStatus(worker.workerId, { status: 'offline' });
          continue;
        }

        try {
          const client = new WorkerClient(worker.address);
          const status = await client.getStatus();
          this.updateWorkerStatus(worker.workerId, status);
        } catch (err) {
          logger.warn(`Worker health check failed: ${worker.workerId}`);
          // Mark as offline if it was previously active, maybe we increment a missed heartbeat counter here in a real system
        }
      }
    }, config.workerPollIntervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
