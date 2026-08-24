#!/bin/bash
# Run everything locally (without Docker)
# Starts: target server, controller, frontend dev server, and one worker

SCRIPT_DIR=$(dirname "$0")
cd "$SCRIPT_DIR/.." || exit 1

echo "Starting local environment..."

# 1. Target server
cd examples/target-server && npm install && npm start &
TARGET_PID=$!

# 2. Controller
cd ../../controller && npm run dev &
CONTROLLER_PID=$!

# 3. Frontend
cd ../frontend && npm run dev &
FRONTEND_PID=$!

# 4. Engine
cd ../engine/build && ./loadforge --worker --worker-port 9090 --worker-id worker-1 &
ENGINE_PID=$!

echo "Local environment running. Press Ctrl+C to stop."

cleanup() {
    echo "Stopping all processes..."
    kill $TARGET_PID $CONTROLLER_PID $FRONTEND_PID $ENGINE_PID
    wait $TARGET_PID $CONTROLLER_PID $FRONTEND_PID $ENGINE_PID 2>/dev/null
    echo "Stopped."
}

trap cleanup SIGINT SIGTERM
wait
