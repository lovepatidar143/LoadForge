#!/bin/bash
# Build and start everything with Docker Compose
cd "$(dirname "$0")/.." || exit 1

docker compose up --build -d
echo "LoadForge is running!"
echo "Dashboard: http://localhost:3000"
echo "API: http://localhost:3001"
echo "Prometheus: http://localhost:9090"
echo "Grafana: http://localhost:3030 (admin/admin)"
echo "Target server: http://localhost:8080"
