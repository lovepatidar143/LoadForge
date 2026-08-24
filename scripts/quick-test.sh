#!/bin/bash
# Run a quick load test using the CLI (no controller needed)
# Usage: ./scripts/quick-test.sh [url] [duration] [rate] [concurrency]

URL=${1:-"http://localhost:8080/api/users"}
DURATION=${2:-"10s"}
RATE=${3:-"100"}
CONCURRENCY=${4:-"10"}

echo "Running quick load test..."
echo "Target: $URL"
echo "Duration: $DURATION"
echo "Rate: $RATE rps"
echo "Concurrency: $CONCURRENCY"

# Assumes engine is built and available at engine/build/loadforge
SCRIPT_DIR=$(dirname "$0")
"$SCRIPT_DIR/../engine/build/loadforge" --test --url "$URL" --duration "$DURATION" --rate "$RATE" --concurrency "$CONCURRENCY"
