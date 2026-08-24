export interface TestConfig {
  testId: string;
  targetUrl: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: string;
  requestsPerSecond: number;  // 0 = unlimited
  concurrency: number;
  durationSeconds: number;
  rampUpSeconds: number;
  rampDownSeconds: number;
  timeoutMs: number;
  keepAlive: boolean;
  maxConnections: number;
}

export interface LatencyStats {
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  p999Ms: number;
}

export interface MetricsSnapshot {
  workerId: string;
  testId: string;
  timestampMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  bytesSent: number;
  bytesReceived: number;
  currentRps: number;
  activeConnections: number;
  queueDepth: number;
  statusCodes: Record<number, number>;
  errors: Record<string, number>;
  latency: LatencyStats;
  workerCpuPercent: number;
  workerMemoryMb: number;
}

export interface TestResult {
  testId: string;
  config: TestConfig;
  startTimeMs: number;
  endTimeMs: number;
  actualDurationSeconds: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  meanRps: number;
  peakRps: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  latency: LatencyStats;
  statusCodes: Record<number, number>;
  errors: Record<string, number>;
  timeline: MetricsSnapshot[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
}

export interface WorkerInfo {
  workerId: string;
  address: string;  // host:port
  status: 'idle' | 'running' | 'error' | 'offline';
  cpuPercent: number;
  memoryMb: number;
  lastHeartbeatMs: number;
  currentTestId?: string;
}

export type TestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
