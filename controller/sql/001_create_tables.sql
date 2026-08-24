CREATE TABLE IF NOT EXISTS tests (
  id VARCHAR(36) PRIMARY KEY,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  start_time BIGINT,
  end_time BIGINT,
  duration_seconds INTEGER,
  total_requests BIGINT DEFAULT 0,
  successful_requests BIGINT DEFAULT 0,
  failed_requests BIGINT DEFAULT 0,
  error_rate DOUBLE PRECISION DEFAULT 0,
  mean_rps DOUBLE PRECISION DEFAULT 0,
  peak_rps DOUBLE PRECISION DEFAULT 0,
  total_bytes_sent BIGINT DEFAULT 0,
  total_bytes_received BIGINT DEFAULT 0,
  latency_min_ms DOUBLE PRECISION,
  latency_max_ms DOUBLE PRECISION,
  latency_mean_ms DOUBLE PRECISION,
  latency_p50_ms DOUBLE PRECISION,
  latency_p90_ms DOUBLE PRECISION,
  latency_p95_ms DOUBLE PRECISION,
  latency_p99_ms DOUBLE PRECISION,
  latency_p999_ms DOUBLE PRECISION,
  status_codes JSONB,
  errors JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_timeline (
  id SERIAL PRIMARY KEY,
  test_id VARCHAR(36) REFERENCES tests(id) ON DELETE CASCADE,
  timestamp_ms BIGINT NOT NULL,
  worker_id VARCHAR(64),
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  current_rps DOUBLE PRECISION,
  active_connections INTEGER,
  latency_p50_ms DOUBLE PRECISION,
  latency_p95_ms DOUBLE PRECISION,
  latency_p99_ms DOUBLE PRECISION,
  error_rate DOUBLE PRECISION,
  worker_cpu_percent DOUBLE PRECISION,
  worker_memory_mb DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS workers (
  id VARCHAR(64) PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  cpu_percent DOUBLE PRECISION DEFAULT 0,
  memory_mb DOUBLE PRECISION DEFAULT 0,
  last_heartbeat BIGINT,
  current_test_id VARCHAR(36) REFERENCES tests(id),
  registered_at TIMESTAMPTZ DEFAULT NOW()
);
