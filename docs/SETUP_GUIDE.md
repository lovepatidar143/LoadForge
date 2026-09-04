# LoadForge — Setup & Usage Guide

## Quick Start (5 minutes)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| C++ Compiler | C++17 | `xcode-select --install` (macOS) |
| CMake | 3.16+ | `brew install cmake` |
| Node.js | 18+ | `brew install node` |

### Step 1: Build the Engine

```bash
cd engine
mkdir -p build && cd build
cmake ..
make -j$(sysctl -n hw.ncpu)
```

Verify: `./loadforge --help` should print usage info.

### Step 2: Start a Target Server

```bash
cd examples/target-server
npm install
node server.js
# Output: Target server running on port 8080
```

### Step 3: Run a Load Test

```bash
cd engine/build
./loadforge --url http://localhost:8080/api/health --rate 100 --duration 10
```

---

## CLI Reference

```
loadforge --url <target> [options]
```

### All Options

| Flag | Default | Description |
|------|---------|-------------|
| `--url <url>` | (required) | Target URL to test |
| `--rate <n>` | 10 | Requests per second |
| `--duration <n>` | 10 | Test duration in seconds |
| `--concurrency <n>` | 10 | Worker threads |
| `--connections <n>` | 100 | Max connection pool size |
| `--timeout <ms>` | 5000 | Request timeout (milliseconds) |
| `--method <M>` | GET | HTTP method (GET/POST/PUT/DELETE) |
| `--header <k:v>` | — | Custom header (repeatable) |
| `--body <data>` | — | Request body for POST/PUT |
| `--ramp-up <n>` | 0 | Ramp-up seconds |
| `--ramp-down <n>` | 0 | Ramp-down seconds |
| `--no-keepalive` | — | Disable HTTP keep-alive |
| `--help` | — | Show help |

### Examples

```bash
# Basic GET test — 100 req/s for 10 seconds
./loadforge --url http://localhost:8080/api/health --rate 100 --duration 10

# POST with JSON body
./loadforge --url http://localhost:8080/api/users \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"test","email":"test@example.com"}' \
  --rate 50 --duration 30

# High-throughput test
./loadforge --url http://myapi.com/endpoint \
  --rate 1000 --duration 60 --concurrency 50 --connections 200

# Gradual ramp-up
./loadforge --url http://localhost:8080/api/health \
  --rate 500 --duration 30 --ramp-up 10 --ramp-down 5

# With auth headers
./loadforge --url http://localhost:8080/api/data \
  --header "Authorization: Bearer mytoken123" \
  --rate 200 --duration 20

# No keep-alive (new TCP connection per request)
./loadforge --url http://localhost:8080/api/health \
  --rate 50 --duration 10 --no-keepalive
```

---

## Understanding the Output

### Live Metrics (printed every second)

```
  RPS:    499.4 | Latency P50:    9.8 ms | P99:   10.8 ms | Errors: 0 | Conn: 5
```

| Column | Meaning |
|--------|---------|
| RPS | Actual completed requests/second |
| P50 | Median latency (half are faster) |
| P99 | 99th percentile (only 1% slower) |
| Errors | Cumulative failures |
| Conn | Active connections right now |

### Final Report

```
Results:
  Total Requests:  600
  Successful:      600
  Failed:          0
  Success Rate:    100.0%

Latency:
  P50:  1.0 ms      ← typical experience
  P95:  1.9 ms      ← worst 5%
  P99:  21.1 ms     ← worst 1% (tail latency)

Throughput:
  Bytes Sent:  41400
  Bytes Recv:  136800
```

### What to Watch For

| Signal | Meaning |
|--------|---------|
| RPS matches --rate | ✅ Everything healthy |
| RPS < --rate | ⚠️ Target or generator bottleneck |
| P99 >> P50 | ⚠️ Tail latency problem |
| Errors climbing | ❌ Target failing under load |
| P50 increasing each second | ⚠️ Server degrading |

---

## Common Test Scenarios

### Find the Breaking Point

```bash
./loadforge --url http://localhost:3000/api/users --rate 100 --duration 30
./loadforge --url http://localhost:3000/api/users --rate 500 --duration 30
./loadforge --url http://localhost:3000/api/users --rate 1000 --duration 30
./loadforge --url http://localhost:3000/api/users --rate 2000 --duration 30
# ↑ Watch for: rising latency, errors appearing, RPS plateau
```

### Sustained Load (find memory leaks)

```bash
./loadforge --url http://localhost:3000/api/users --rate 200 --duration 300
# 5 minutes at steady load. Watch for: latency creeping up = memory leak
```

### Spike Test

```bash
./loadforge --url http://localhost:3000/api/users --rate 1000 --duration 10
# Sudden burst. Watch for: how quickly server recovers
```

### Test POST Endpoints

```bash
./loadforge --url http://localhost:3000/api/users \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"test"}' \
  --rate 100 --duration 30
```

---

## Target Server Configuration

The bundled example server supports environment variables:

```bash
# Default: 10ms latency, 0% errors
node server.js

# Custom latency and error rate
LATENCY=50 ERROR_RATE=0.1 node server.js    # 50ms latency, 10% errors

# Endpoints available:
# GET  /api/health   → "OK" (no simulated latency)
# GET  /api/users    → JSON array (with latency)
# POST /api/users    → Echo body (with latency)
# GET  /api/slow     → 500ms+ response
# GET  /api/error    → 500 Internal Server Error
```

---

## Full Stack Setup

### All Components Running Locally

```bash
# Terminal 1: Target server
cd examples/target-server && node server.js

# Terminal 2: Controller (REST API + WebSocket on port 3001)
cd controller && npm install && npm run dev

# Terminal 3: Frontend dashboard (port 3000)
cd frontend && npm install && npm run dev

# Terminal 4: Run load tests
cd engine/build
./loadforge --url http://localhost:8080/api/health --rate 100 --duration 30
```

### Docker (everything in one command)

```bash
docker compose up --build
```

| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3000 | http://localhost:3000 |
| Controller | 3001 | http://localhost:3001/api/health |
| Target | 8080 | http://localhost:8080/api/health |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3030 | http://localhost:3030 (admin/admin) |

Tear down: `docker compose down -v`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Engine won't compile | `brew install cmake` then clean rebuild: `cd engine/build && rm -rf * && cmake .. && make` |
| "Connection refused" | Target server not running. Start it: `cd examples/target-server && node server.js` |
| RPS lower than --rate | Increase `--concurrency` and `--connections`. Or target is the bottleneck. |
| High P99 but low P50 | Normal! Caused by TCP handshake, GC pauses, or context switches. |
| "Too many open files" | Run: `ulimit -n 65536` |
| No output in pipes | Already fixed with `std::unitbuf`. Try: `stdbuf -oL ./loadforge ...` |
| npm install fails | `npm cache clean --force` then retry |

---

## Project Layout

```
LoadForge/
├── engine/                    # C++ load generation engine
│   ├── include/loadforge/     #   Header files (.h)
│   ├── src/                   #   Source files (.cpp)
│   ├── tests/                 #   Unit tests
│   └── CMakeLists.txt         #   Build configuration
├── controller/                # Node.js orchestrator
│   ├── src/                   #   TypeScript source
│   └── sql/                   #   Database migrations
├── frontend/                  # React dashboard
│   └── src/                   #   Components, hooks, services
├── docker/                    # Dockerfiles + configs
├── examples/target-server/    # Example HTTP server
├── proto/                     # Protocol Buffer definitions
├── scripts/                   # Helper scripts
├── docs/                      # All documentation
│   ├── LOADFORGE_FROM_SCRATCH.md   # Complete technical book
│   ├── SETUP_GUIDE.md              # This file
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   └── INTERVIEW_HANDBOOK.md
└── docker-compose.yml
```
