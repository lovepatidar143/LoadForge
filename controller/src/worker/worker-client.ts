import fetch from 'node-fetch';
import { TestConfig, WorkerInfo, MetricsSnapshot } from '../types';
import { logger } from '../utils/logger';

export class WorkerClient {
  private address: string;

  constructor(address: string) {
    // Ensure address doesn't end with slash
    this.address = address.endsWith('/') ? address.slice(0, -1) : address;
  }

  async startTest(config: TestConfig): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.address}/api/test/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        return { success: false, message: data?.error || 'Failed to start test on worker' };
      }
      return { success: true, message: 'Test started' };
    } catch (err: any) {
      logger.error('WorkerClient startTest error', { address: this.address, error: err.message });
      return { success: false, message: err.message };
    }
  }

  async stopTest(testId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.address}/api/test/${testId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json() as any;
        return { success: false, message: data?.error || 'Failed to stop test on worker' };
      }
      return { success: true, message: 'Test stopped' };
    } catch (err: any) {
      logger.error('WorkerClient stopTest error', { address: this.address, error: err.message });
      return { success: false, message: err.message };
    }
  }

  async getStatus(): Promise<WorkerInfo> {
    const res = await fetch(`${this.address}/api/status`);
    if (!res.ok) throw new Error('Failed to fetch worker status');
    return await res.json() as WorkerInfo;
  }

  async getMetrics(): Promise<MetricsSnapshot> {
    const res = await fetch(`${this.address}/api/metrics`);
    if (!res.ok) throw new Error('Failed to fetch worker metrics');
    return await res.json() as MetricsSnapshot;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.address}/api/health`, { timeout: 2000 });
      return res.ok;
    } catch {
      return false;
    }
  }
}
