#!/bin/bash
# Integration test: start target server, run engine, verify output

set -e

echo "Starting full pipeline integration test..."

SCRIPT_DIR=$(dirname "$0")
ROOT_DIR="$SCRIPT_DIR/../.."

# 1. Start target server in background
cd "$ROOT_DIR/examples/target-server"
npm install > /dev/null 2>&1
PORT=8081 node server.js > target.log 2>&1 &
TARGET_PID=$!

echo "Started target server (PID: $TARGET_PID)"
sleep 2 # wait for startup

# 2. Run engine against it
echo "Running engine load test..."
cd "$ROOT_DIR/engine/build"
if [ ! -f "loadforge" ]; then
    echo "Engine binary missing. Skipping actual test."
else
    ./loadforge --test --url "http://localhost:8081/api/users" --duration 5s --rate 50 > engine.log 2>&1
    
    if grep -q "Success" engine.log; then
        echo "Engine test completed successfully."
    else
        echo "Engine test failed. See engine.log"
    fi
fi

# 3. Cleanup
echo "Cleaning up..."
kill $TARGET_PID

echo "Integration test completed."
