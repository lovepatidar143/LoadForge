import { TestConfig, TestResult, MetricsSnapshot, WorkerInfo } from '../types';

const API_BASE = '/api';

export async function createTest(config: Partial<TestConfig>): Promise<TestResult> {
  const res = await fetch(`${API_BASE}/tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTests(page = 1, limit = 50): Promise<{ tests: TestResult[], total: number }> {
  const res = await fetch(`${API_BASE}/tests?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTest(testId: string): Promise<TestResult> {
  const res = await fetch(`${API_BASE}/tests/${testId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopTest(testId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tests/${testId}/stop`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
}

export async function getTestMetrics(testId: string): Promise<MetricsSnapshot[]> {
  const res = await fetch(`${API_BASE}/tests/${testId}/metrics`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listWorkers(): Promise<WorkerInfo[]> {
  const res = await fetch(`${API_BASE}/workers`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function registerWorker(address: string): Promise<WorkerInfo> {
  const res = await fetch(`${API_BASE}/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function removeWorker(workerId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workers/${workerId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getStats(): Promise<any> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
