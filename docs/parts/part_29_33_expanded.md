# PART XXIX — ARCHITECTURAL DECISIONS (ADRs)
*(Refer to `DECISIONS.md` for the fully expanded list of 15 ADRs.)*

# PART XXX — COMPLETE REBUILD GUIDE

If the repository is deleted, follow these 41 exact steps to recreate LoadForge.

### Phase 1: C++ Engine Foundation
1. **Directory Setup:** `mkdir -p loadforge/engine/src loadforge/engine/include`
2. **Git Init:** `cd loadforge && git init`
3. **CMake Configuration:** Create `CMakeLists.txt` specifying `C++17` and linking `pthread`.
4. **Config Struct:** Create `include/config.h` defining `struct Config { std::string url; int rps; int duration; };`
5. **RAII Socket Wrapper:** Create `socket.h / socket.cpp`. Implement `socket()`, `fcntl()` (O_NONBLOCK), `connect()`, `send()`, and a move constructor.
6. **URL Parser:** Create `url_parser.cpp` to extract protocol, host, port, and path from a URI string.
7. **HTTP Client:** Create `http_client.cpp` to construct `GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: keep-alive\r\n\r\n`.
8. **HTTP Parser:** Create a state machine in `http_parser.cpp` that buffers `recv()` until `\r\n\r\n` is found.

### Phase 2: Engine Concurrency & Metrics
9. **Connection Pool:** Create a `std::queue<Socket>` wrapped in a `std::mutex`. Add `acquire()` and `release()` methods.
10. **Token Bucket Rate Limiter:** Create `rate_limiter.cpp`. Use `std::chrono::steady_clock` to calculate elapsed time, adding tokens up to a max burst. Use `std::atomic::compare_exchange_weak` for consumption.
11. **Logarithmic Histogram:** Create `histogram.h`. Define `std::array<std::atomic<uint64_t>, 1000> buckets`. Map `log10(latency)` to the array index.
12. **Worker Threads:** Create `thread_pool.cpp`. Spawn `N` threads (matching CPU cores). Each thread runs an infinite loop checking the token bucket.
13. **The poll() Loop:** Inside the worker thread, after sending the HTTP request, use `poll()` with a timeout to wait for the socket to become readable (`POLLIN`).
14. **Metrics Struct:** Create `metrics.h` to hold total requests, errors, and bytes transferred.
15. **JSON Emitter:** Write a simple string builder to format the histogram and metrics into a valid JSON string payload.
16. **Worker Server:** Use a simple TCP socket listening on port 8080 to accept `POST /start` commands containing target configuration.
17. **Engine Main:** Wire the server, thread pool, and metrics together in `main.cpp`.
18. **Compile & Unit Test:** `mkdir build && cd build && cmake .. && make`. Run against a local Python HTTP server.

### Phase 3: Node.js Orchestrator
19. **Controller Init:** `cd ../controller && npm init -y && npm i express ws pg typescript ts-node`.
20. **TS Config:** Initialize `tsconfig.json`.
21. **Postgres Setup:** Define schema: `CREATE TABLE tests (id UUID, config JSONB, start_time TIMESTAMP);`
22. **Express API:** Create `POST /api/tests`. Validate incoming JSON config.
23. **Worker Manager:** Create a class that maintains a list of worker IPs. Implement a 5-second HTTP heartbeat check.
24. **Load Distribution Math:** In the test starter, divide total RPS by the number of healthy workers. Send HTTP POST to each worker with their share.
25. **Aggregator Engine:** Create an endpoint `POST /api/metrics/flush` where workers send data.
26. **Histogram Merge Algorithm:** Add the arrays of the worker histograms together. Walk the merged array from the back to calculate the P99 index, then map back to latency.
27. **WebSocket Server:** Attach `ws` to the Express HTTP server. Broadcast merged metrics every 1000ms.
28. **Prometheus Exporter:** Add `prom-client` and expose `/metrics` for controller RAM and CPU usage.

### Phase 4: React Dashboard
29. **Vite Init:** `npm create vite@latest dashboard -- --template react-ts`.
30. **Tailwind:** Install and configure Tailwind CSS.
31. **API Hooks:** Write `useTestStart()` to hit the Controller REST API.
32. **WebSocket Hook:** Write `useMetricsStream()` using the native browser `WebSocket` object.
33. **State Management:** Map incoming WebSocket JSON to React state (`setMetrics()`).
34. **Recharts Integration:** Import `<LineChart>`, plot RPS over time on one chart, and P50/P99 latency on a secondary composed chart.

### Phase 5: Containerization & Deployment
35. **Engine Dockerfile:** Multi-stage build. Base `ubuntu:22.04`, install `build-essential cmake`. Compile engine. Copy binary to a scratch image.
36. **Controller Dockerfile:** Node 18 Alpine. `npm run build`, copy `dist/`.
37. **Dashboard Dockerfile:** Build React app, serve statically using `nginx:alpine`.
38. **Docker Compose:** Create `docker-compose.yml`. Define `postgres`, `controller`, `dashboard`, and 3 replicas of `worker`.
39. **Network Config:** Ensure workers map to the host network for maximum performance.
40. **Grafana Config:** Export the Prometheus dashboard JSON and mount it into a Grafana container.
41. **Integration Test:** `docker-compose up -d`. Open dashboard at `localhost:3000`, enter `http://target`, set 50,000 RPS, and watch the graphs.

---

# PART XXXII — PROJECT DEFENSE

## The 2-Minute Explanation
"LoadForge is a high-performance, distributed HTTP load testing platform. I separated it into three tiers to optimize for both performance and usability. The data plane consists of worker nodes written in C++17, which bypass runtime overhead and garbage collection to measure true network latency. They use raw POSIX sockets, a lock-free token bucket for precise rate limiting, and an atomic logarithmic histogram for O(1) metrics tracking. 

The control plane is a Node.js controller that manages these workers, aggregates their telemetry, and stores time-series data in PostgreSQL. Finally, the visualization layer is a React dashboard that receives live metric streams via WebSockets. It allowed me to deeply explore OS-level networking, lock-free concurrency, and distributed system orchestration."

## Hostile Question Defense

**Q: "Did you actually build this, or is this just a wrapper around an existing tool?"**
**Defense:** "I wrote the core from scratch. I explicitly avoided `libcurl` and wrote the POSIX socket wrapper and HTTP protocol parser manually. I built the token bucket using `std::atomic` and `std::chrono`. I encountered a critical bug where my token bucket was spinning the CPU to 100% due to a tight CAS loop without a `yield`, which I had to fix by implementing exponential backoff in the lock-free algorithm."

**Q: "Why C++? You could write this in Go in half the time."**
**Defense:** "Go is fantastic, but its garbage collector introduces microsecond pauses. When you are measuring the P99 response time of a target system, a 2-millisecond GC pause in the load tester will artificially inflate your latency measurements. C++ provides deterministic memory management, ensuring that the latency I measure is the target's latency, not my tool's."

**Q: "How do you know your percentile aggregations are mathematically accurate across workers?"**
**Defense:** "Initially, I just averaged the P99s from each worker, which is mathematically invalid. I realized this and rewrote the pipeline so workers send their raw logarithmic histogram arrays. The controller performs vector addition on these arrays to recreate the true, global distribution, and calculates the true P99 from that."

---

# PART XXXIII — LIMITATIONS AND FUTURE WORK

Be brutally honest. Systems engineering is about acknowledging trade-offs.

### Current Limitations
1. **No HTTPS / TLS:** The raw socket client only implements plaintext HTTP over TCP. It does not perform TLS handshakes, limiting its real-world applicability to internal network targets.
2. **HTTP/2 & HTTP/3 Unsupported:** The parser only understands line-delimited HTTP/1.1. It cannot handle HTTP/2 binary frames, multiplexing, or QUIC.
3. **Coordinated Omission Vulnerability:** While the token bucket tracks intended start times, extreme server stalls that block all threads will prevent the engine from backfilling requests accurately.
4. **SPOF Controller:** The Node.js controller is a single point of failure. If it crashes, test coordination stops.
5. **No Dynamic Payload Support:** Currently, the load tester hits static endpoints. It cannot execute Lua or JS scripts to emulate complex user journeys (e.g., login, parse token, fetch profile).
6. **Inefficient HTTP/JSON Parsing:** The C++ worker receives target configurations via a very naive JSON parser that cannot handle complex nested structures.
7. **Basic Connection Sizing:** The connection pool size is static. It does not dynamically grow or shrink based on network congestion or server keep-alive timeouts.

### Future Work & Architectural Upgrades
1. **TLS Integration via BoringSSL:** Wrap the raw POSIX socket in an `SSL*` object. Handle `SSL_ERROR_WANT_READ` inside the `poll()` loop to enable HTTPS support.
2. **eBPF Kernel Tracing:** Replace `std::chrono` user-space timing with an eBPF program attached to the kernel's `tcp_sendmsg` and `tcp_rcvmsg` tracepoints. This entirely removes user-space scheduling jitter from the metrics.
3. **t-digest Histogram Compression:** Replace the fixed-size logarithmic array with a `t-digest` data structure, allowing highly compressed, mathematically provable quantile merging across thousands of distributed workers.
4. **Kubernetes Operator Auto-Scaling:** Build a Go-based Kubernetes Operator. When the user requests 1,000,000 RPS, the Operator dynamically spins up 50 C++ worker pods, injects the target config, and tears them down afterward.
5. **gRPC Protocol Upgrade:** Replace the HTTP/JSON worker-controller communication with gRPC and Protobuf for strict typing and highly efficient binary streaming of metric flushes.
