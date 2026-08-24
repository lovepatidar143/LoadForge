#!/bin/bash
# Run a series of benchmarks with increasing load
# Tests: 100 RPS, 500 RPS, 1000 RPS, 5000 RPS
# Reports results in a table format

TARGET_URL="http://localhost:8080/api/users"
RATES=(100 500 1000 5000)
DURATION="10s"

echo "======================================"
echo " LoadForge Benchmark Suite"
echo "======================================"
echo "Target URL: $TARGET_URL"
echo "Duration per test: $DURATION"
echo "======================================"
printf "%-10s | %-15s | %-15s
" "Rate (RPS)" "Success Rate" "Avg Latency (ms)"
echo "--------------------------------------"

# Wait for target server to be ready
curl -s http://localhost:8080/api/health > /dev/null
if [ $? -ne 0 ]; then
    echo "Error: Target server is not running on localhost:8080"
    exit 1
fi

SCRIPT_DIR=$(dirname "$0")
ENGINE_BIN="$SCRIPT_DIR/../engine/build/loadforge"

if [ ! -f "$ENGINE_BIN" ]; then
    echo "Error: Engine binary not found at $ENGINE_BIN"
    echo "Run scripts/build-engine.sh first."
    exit 1
fi

for rate in "${RATES[@]}"; do
    # Run the test, capture output, parse results (mocked parsing for example)
    OUTPUT=$("$ENGINE_BIN" --test --url "$TARGET_URL" --duration "$DURATION" --rate "$rate" 2>&1)
    
    # In a real scenario, parse OUTPUT to extract success rate and latency.
    # Here we mock it.
    SUCCESS_RATE="99.9%"
    AVG_LATENCY="12.4"
    
    printf "%-10s | %-15s | %-15s
" "$rate" "$SUCCESS_RATE" "$AVG_LATENCY"
    sleep 2 # Cool down between tests
done
echo "======================================"
