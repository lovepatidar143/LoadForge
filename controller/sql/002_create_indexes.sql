CREATE INDEX IF NOT EXISTS idx_test_timeline_test_id ON test_timeline(test_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
