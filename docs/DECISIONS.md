# Architectural Decisions Record (ADR)

In systems engineering, every decision is a trade-off. There are no perfect solutions, only optimal balances between latency, throughput, complexity, and maintainability. This section documents the 15 core architectural decisions that define LoadForge.

### ADR-001: C++17 for the Load Engine
**Context:** We need a systems language for the performance-critical HTTP load generator. It must be capable of saturating a network link with minimal CPU overhead.
**Options:** C, C++, Go, Rust, Java
**Decision:** C++17
**Reason:** 
- Near-metal performance without runtime overhead or unpredictable latency spikes.
- Direct, unadulterated access to POSIX sockets, `poll()`, and OS-level system calls.
- Standard library components (`std::thread`, `std::atomic`, `std::chrono`) for portable, low-level concurrency.
- Zero garbage collector (GC) pauses, which is absolutely critical for accurate microsecond-level latency measurement.
**Trade-offs:** Significantly harder to write safely than Go or Rust; manual memory management and lifetime tracking are required. No built-in HTTP library.
**Future alternatives:** Rust (for strict memory safety without GC).

### ADR-002: Node.js for the Controller
**Context:** We need a runtime for the orchestration layer, which coordinates distributed workers, aggregates metrics, and serves the dashboard.
**Options:** Python, Node.js, Go, Java
**Decision:** Node.js with TypeScript
**Reason:** Event-driven, non-blocking I/O is perfect for coordination, where the workload is I/O-bound rather than CPU-bound. Excellent WebSocket support. TypeScript provides strong compile-time type safety.
**Trade-offs:** Single-threaded event loop means CPU-heavy metric aggregations could block the loop.
**Future alternatives:** Go (if the controller becomes highly CPU-bound).

### ADR-003: React for the Dashboard
**Context:** We need a real-time dashboard for metrics visualization.
**Options:** Vanilla JS, React, Vue, Svelte
**Decision:** React + TypeScript + Vite
**Reason:** Component-based model allows for reusable UI elements. Hooks simplify complex WebSocket state management. Recharts provides fast, SVG-based charting.
**Trade-offs:** Heavy initial payload compared to vanilla JS, but acceptable for an internal tool.

### ADR-004: HTTP/JSON for Worker Communication
**Context:** Need a communication protocol between the Node.js controller and the C++ workers.
**Options:** gRPC, TCP Sockets, HTTP/JSON, WebSockets
**Decision:** HTTP/JSON initially.
**Reason:** Integrating gRPC into a C++ build introduces massive dependencies (Protobuf, gRPC core) which can add 30+ minutes to the build time. HTTP/JSON uses the same code paths we already built for the HTTP client, reducing complexity.
**Trade-offs:** Less efficient parsing, no bidirectional streaming, no strict type generation.
**Future alternatives:** gRPC.

### ADR-005: PostgreSQL for Persistence
**Context:** Storing historical load test results, metadata, and aggregated metrics.
**Options:** SQLite, MongoDB, PostgreSQL, InfluxDB
**Decision:** PostgreSQL.
**Reason:** ACID compliance, excellent JSONB support for dynamic test configurations, and robust time-series capabilities. Standardized and easy to host.
**Trade-offs:** Requires a separate DB process, unlike SQLite.

### ADR-006: WebSockets for Real-Time Updates
**Context:** Pushing live metrics from the controller to the web dashboard.
**Options:** Long-polling, Server-Sent Events (SSE), WebSockets
**Decision:** WebSockets.
**Reason:** Persistent connection, low latency, bidirectional. While SSE is great for one-way streams, WebSockets allow the UI to send abort commands over the same low-latency channel.

### ADR-007: poll() for I/O Multiplexing
**Context:** Handling multiple non-blocking sockets in a single C++ thread.
**Options:** `select()`, `poll()`, `epoll()` (Linux), `kqueue()` (macOS)
**Decision:** `poll()`
**Reason:** POSIX standard, highly portable across Linux and macOS. While `epoll()` scales better for >10,000 connections, `poll()` is sufficient for our connection-pooled architecture where each thread handles a few hundred connections.
**Future alternatives:** Abstract the event loop to support `epoll()` natively on Linux.

### ADR-008: Atomic Token Bucket for Rate Limiting
**Context:** Ensuring the load generator respects the requested requests-per-second (RPS).
**Options:** Sleep loops, Mutex-locked counter, Atomic Token Bucket
**Decision:** Atomic Token Bucket.
**Reason:** Sleep loops are wildly inaccurate at high RPS. Mutexes destroy thread pool throughput. An atomic token bucket allows lock-free compare-and-swap consumption of tokens, providing smooth rate limiting with microsecond precision.

### ADR-009: Logarithmic Histogram for Latency
**Context:** Recording latency for millions of requests without unbounded memory growth.
**Options:** Store all arrays, HdrHistogram, Logarithmic Buckets
**Decision:** Logarithmic Bucket Histogram.
**Reason:** O(1) insertion time. Fixed memory footprint. Threads can update buckets using lock-free atomics (`fetch_add`).
**Trade-offs:** Slight loss of precision at very high latencies (e.g., 5010ms vs 5020ms are bucketed together).

### ADR-010: Connection Pooling with Keep-Alive
**Context:** Managing TCP connections to the target server.
**Options:** Close after every request, Connection Pool
**Decision:** Reusable Connection Pool (HTTP Keep-Alive).
**Reason:** Reusing TCP connections avoids the 3-way TCP handshake overhead on every request, which would otherwise skew latency metrics and exhaust ephemeral ports (TIME_WAIT exhaustion).

### ADR-011: Fixed Thread Pool
**Context:** Scaling concurrency in the C++ worker engine.
**Options:** One-thread-per-request, dynamic thread pool, fixed thread pool.
**Decision:** Fixed-size Thread Pool.
**Reason:** Creating a thread per request is incredibly slow and wastes memory. A fixed pool of worker threads sized to the CPU core count maximizes CPU cache locality and minimizes context switches.

### ADR-012: Local Metric Aggregation
**Context:** Sending metrics from C++ worker to Node.js controller.
**Options:** Stream every request, aggregate locally and flush.
**Decision:** Local aggregation and periodic flushing (every 1 second).
**Reason:** Streaming every request over the network would DDoS the controller. Aggregating locally into the histogram makes the network overhead constant (O(1)) regardless of whether the RPS is 100 or 1,000,000.

### ADR-013: Prometheus for Observability
**Context:** Exposing internal controller state and health.
**Decision:** Prometheus `/metrics` endpoint.
**Reason:** Industry standard. Integrates easily with Grafana for meta-monitoring (monitoring the load testing system itself).

### ADR-014: Docker for Deployment
**Context:** Packaging and distributing the system.
**Decision:** Docker and `docker-compose`.
**Reason:** Ensures consistent environments. The C++ engine requires specific library versions (CMake, compiler) which are perfectly encapsulated in a multi-stage Docker build.

### ADR-015: No HTTPS in Raw Socket Client MVP
**Context:** Target protocol support for the C++ engine.
**Decision:** HTTP/1.1 only (no TLS).
**Reason:** Implementing TLS from scratch is a massive security risk. Integrating OpenSSL adds significant dependency weight and cross-compilation complexity. We accept this limitation for the v1 implementation to focus on core OS/networking concepts.
**Future alternatives:** Integrate BoringSSL.
