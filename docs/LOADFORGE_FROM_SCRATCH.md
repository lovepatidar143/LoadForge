# LoadForge — Building a Distributed Load Testing Platform From Scratch

> **What this book is:** A complete, from-zero technical guide to building a distributed HTTP load-testing and performance-analysis platform. It covers the theory, design, implementation, testing, and deployment of every component — from raw TCP sockets to a distributed worker fleet with real-time dashboards.
>
> **Who this book is for:** A developer who knows basic C++, basic Python, basic web development, and wants to deeply understand systems programming, computer networking, concurrency, distributed systems, and performance engineering by building something real.
>
> **How to read it:** Start from Chapter 1. Do not skip chapters. Do not skip exercises. Every concept taught here is used later in the project. If you skip a concept, you will not understand the code that depends on it.

---

# Part I — Understanding the Problem

---

## Chapter 1: What Are We Building?

### The One-Sentence Answer

We are building a tool that generates controlled HTTP traffic, sends it at a target server, and measures how the server performs under that load.

That's it. Everything else in this project — the C++ engine, the distributed workers, the real-time dashboard, the metrics pipeline — exists to make that one sentence work reliably, accurately, and at scale.

### But Why Do I Need a Tool for This?

Imagine you have built an API. Maybe it's an e-commerce backend, a social media feed, or a payment service. You tested it with Postman. It works. You send a request, you get a response. Ship it.

Then 10,000 users arrive.

Suddenly:
- Requests that took 50 milliseconds now take 3 seconds.
- Some requests fail entirely with timeout errors.
- The database runs out of connections.
- The server's CPU hits 100%.
- Memory usage climbs until the process crashes.
- Users see blank pages and error messages.

**Why didn't you catch this during development?**

Because during development, you were one user. One request at a time. The server had essentially zero load. Everything was fast.

The problem only appears when the server is under **concurrent load** — many requests arriving at the same time, competing for the same resources (CPU, memory, database connections, network bandwidth, disk I/O).

**Load testing** is the practice of deliberately generating this kind of concurrent traffic *before* real users arrive, so you can find and fix these problems in a controlled environment.

### What Does Our Tool Actually Do?

Here is the complete pipeline of what LoadForge does during a load test:

```
Step 1: You configure a test
   - Target URL: https://api.myapp.com/users
   - Method: GET
   - Concurrency: 100 (simulate 100 simultaneous users)
   - Duration: 60 seconds
   - Rate: 1000 requests/second

Step 2: LoadForge generates HTTP traffic
   - It creates network connections to the target server
   - It sends HTTP requests at the configured rate
   - It does this from multiple concurrent workers

Step 3: LoadForge measures everything
   - For EVERY request, it records:
     - When the request was sent
     - When the first byte of the response arrived
     - When the last byte of the response arrived
     - The HTTP status code (200, 404, 500, etc.)
     - The response size in bytes
     - Whether the request succeeded or failed
     - If it failed, why (timeout, connection refused, etc.)

Step 4: LoadForge aggregates metrics
   - It calculates:
     - Actual requests per second (RPS)
     - Latency percentiles (P50, P95, P99)
     - Error rate
     - Throughput in bytes/second
     - Number of active connections
     - Distribution of status codes

Step 5: LoadForge reports results
   - Real-time graphs showing metrics as the test runs
   - Final report with summary statistics
   - Historical storage so you can compare tests over time
```

### The Two Machines

This is a critical distinction that many beginners miss:

**There are two separate systems involved in every load test:**

```
 ┌──────────────────┐                    ┌──────────────────┐
 │                  │   HTTP requests    │                  │
 │   LOAD GENERATOR │ ================► │  TARGET SERVER   │
 │   (LoadForge)    │                    │  (Your API)      │
 │                  │ ◄================ │                  │
 │                  │   HTTP responses   │                  │
 └──────────────────┘                    └──────────────────┘
       OUR CODE                            THEIR CODE
   We control this.                    We are testing this.
```

**The Load Generator (LoadForge)** is the tool we are building. It generates fake traffic. It is the client. It pretends to be thousands of users.

**The Target Server** is the system being tested. It is someone else's API, or your own API. It is the server. It receives the traffic and tries to handle it.

These are completely independent. They may run on different machines, different networks, different continents. Our job is to build the left side — the load generator — and make it powerful, accurate, and reliable enough to stress-test the right side.

### Why Not Just Use `curl` in a Loop?

You might think: "Can't I just write a bash script that calls `curl` in a loop?"

```bash
# Naive approach — DO NOT use this for real load testing
for i in $(seq 1 10000); do
    curl -s http://api.myapp.com/users > /dev/null &
done
```

This approach has several fundamental problems:

1. **No rate control.** You cannot control exactly how many requests per second are sent. The loop fires requests as fast as the shell can fork processes.

2. **Process overhead.** Each `curl` invocation spawns a new process. Creating 10,000 processes is extremely expensive. The operating system spends more time managing processes than sending requests. Your load generator becomes the bottleneck, not the target server.

3. **No connection reuse.** Each `curl` opens a new TCP connection, performs the request, and closes the connection. Real users' browsers reuse connections (HTTP keep-alive). Your test doesn't simulate real behavior.

4. **No accurate timing.** When did each request start? When did it end? What was the latency? You have no measurements.

5. **No concurrency control.** You launched 10,000 background processes. How many are running concurrently? You don't know. It depends on the OS scheduler.

6. **No metrics.** What was the P99 latency? What was the error rate? What was the actual RPS achieved? You don't know.

7. **No reproducibility.** Run the same script twice. You'll get different results because there's no controlled scheduling.

**This is exactly why we need a proper load testing tool.** A well-engineered load generator solves all of these problems:

| Problem | Our Solution |
|---------|-------------|
| Rate control | Precise request scheduler with token-bucket or leaky-bucket algorithm |
| Process overhead | Thread pool with connection reuse, not one process per request |
| Connection reuse | HTTP keep-alive with connection pooling |
| Accurate timing | High-resolution clock measurements at every stage of the request |
| Concurrency control | Explicit concurrency parameter, controlled with semaphores |
| Metrics | HDR histograms, percentile calculations, real-time aggregation |
| Reproducibility | Deterministic scheduling with configurable parameters |

You don't know what most of these words mean yet. That's fine. You will, because we're going to build every one of them.

---

## Chapter 2: Why Does Load Testing Exist?

### The Fundamental Problem: Systems Behave Differently Under Load

Every server application has **resources** it depends on:

| Resource | What it does | What happens when it runs out |
|----------|-------------|-------------------------------|
| CPU | Processes instructions | Requests slow down, queue up |
| Memory (RAM) | Stores working data | Process crashes (OOM kill) |
| Network bandwidth | Moves data between machines | Requests queue, latency spikes |
| Disk I/O | Reads/writes persistent data | Database queries slow down |
| Database connections | Communicates with database | New requests can't reach the DB |
| File descriptors | Represents open files/sockets | Can't accept new connections |
| Thread pool | Executes concurrent work | Requests queue waiting for a thread |

When your server has one user, none of these are even close to their limits. Everything is fast.

When your server has 100,000 concurrent users, some of these resources will hit their limits. The question is: **which ones?**

Load testing answers this question *before* your users answer it for you during a production outage.

### Real-World Consequences of Not Load Testing

These are not hypothetical scenarios. They happen in production at real companies:

**Scenario 1: The Black Friday Crash**
An e-commerce site launches a holiday sale. Traffic spikes to 50x normal. The application server's thread pool is configured for 200 threads. Each thread holds a database connection. The database is configured for 200 max connections. At 200 concurrent requests, the database connection pool is full. Request #201 waits. Request #202 waits. The wait queue grows. Timeouts cascade. The entire site goes down. Revenue loss: millions.

A load test at 50x traffic would have revealed the database connection limit weeks before the sale.

**Scenario 2: The Slow Memory Leak**
A web application allocates 2KB of memory per request but doesn't free it properly. At 100 requests/second, that's 200KB/second. The server has 8GB of RAM. It takes about 11 hours to run out of memory. The process gets killed by the Linux OOM (Out Of Memory) killer. The server restarts. It happens again 11 hours later.

A sustained load test at 100 RPS for 12 hours would have caught this.

**Scenario 3: The P99 Surprise**
An API responds in 20ms on average. Looks great. But 1% of requests take 5 seconds. That's the P99 latency (the 99th percentile — we'll explain percentiles thoroughly later). If you have 10,000 requests/second, that means 100 requests per second are taking 5 seconds. Those are 100 real users staring at a loading spinner. Your average looked fine. Your tail latency is terrible.

A load test with proper percentile measurement would have revealed this immediately.

### The Types of Load Testing

Not all load tests are the same. Here are the standard types, and we will eventually support all of them:

| Type | Purpose | Example |
|------|---------|---------|
| **Smoke test** | Verify the system works at minimal load | 1 user, 10 requests |
| **Load test** | Verify behavior at expected traffic | 1000 concurrent users, 30 minutes |
| **Stress test** | Find the breaking point | Ramp from 100 to 10,000 users |
| **Spike test** | Test sudden traffic surges | Jump from 100 to 5,000 users instantly |
| **Soak test** (endurance) | Find slow leaks and degradation | 500 users for 24 hours |
| **Breakpoint test** | Find the exact max capacity | Increment by 50 users/min until failure |

Each of these requires different features from our engine:
- **Ramp-up/ramp-down** (gradually increasing/decreasing load)
- **Sustained fixed rate** (constant load over time)
- **Spike generation** (instant jump in traffic)
- **Long duration** (hours or days of continuous testing)

### What Existing Tools Do

You should know what tools exist in this space, because you should understand what we're building and why:

| Tool | Language | Model | Notes |
|------|----------|-------|-------|
| **Apache Bench (ab)** | C | Simple CLI | Very basic, single URL, no scripting |
| **wrk** | C | Multi-threaded | Fast but limited features, single URL |
| **wrk2** | C | Coordinated omission fix | Fixes a critical measurement bug in wrk |
| **k6** | Go | JavaScript scripting | Modern, scriptable, cloud-ready |
| **Gatling** | Scala/JVM | Scenario-based | Powerful DSL, good reports |
| **Locust** | Python | User-based | Easy to script, but Python limits throughput |
| **JMeter** | Java | GUI-based | Enterprise-focused, complex, heavy |
| **Vegeta** | Go | Constant rate | Good rate control, CLI-focused |
| **hey** | Go | Simple CLI | Replacement for ab, simple |

We are building something in the spirit of **wrk2 + k6 + Vegeta**: a high-performance C++ engine (like wrk2) with the distributed architecture and dashboard of k6, and the precise rate control of Vegeta.

### What Makes Our Project Different (as a Learning Exercise)

We are not trying to compete with k6 or Gatling. We are building this to **learn**. The difference is:

1. **We will understand every layer.** Tools like k6 use Go's `net/http` library. We will build our own connection management on top of raw sockets.

2. **We will understand the measurements.** Most tools give you P99 as a number. We will build the histogram data structure that calculates it.

3. **We will understand the distribution.** Most tools have a CLI flag for "distributed mode." We will build the worker registration, task distribution, and metric aggregation ourselves.

4. **We will understand the bottlenecks.** Most tools don't tell you when the load generator itself is the bottleneck. We will detect this.

---

## Chapter 3: What Happens During a Load Test?

Let's trace exactly what happens, step by step, when you run a load test. This is the complete data flow. You won't understand every detail yet — that's expected. This chapter is a map. We'll explore each territory in later chapters.

### Phase 1: Configuration

The user (you) tells LoadForge what to do:

```
Target:       https://api.myapp.com/users
Method:       GET
Headers:      Authorization: Bearer <token>
Rate:         500 requests/second
Concurrency:  50 simultaneous connections
Duration:     60 seconds
Ramp-up:      10 seconds (gradually increase from 0 to 500 RPS)
Timeout:      5 seconds per request
```

This configuration is sent to the **Controller**.

### Phase 2: Test Setup

The Controller:
1. Validates the configuration (is the URL valid? Is the rate reasonable?).
2. Decides how to distribute the work (if we have 3 workers, each generates ~167 RPS).
3. Sends the test configuration to each **Worker** (C++ engine).
4. Records the test in the database (PostgreSQL).
5. Tells the dashboard "a test is starting."

### Phase 3: Workers Generate Traffic

Each Worker (C++ engine):
1. Opens TCP connections to the target server.
2. Starts a high-precision timer.
3. Begins sending HTTP requests at the assigned rate.
4. For each request, records timestamps at multiple points:
   - `t0`: Request scheduled
   - `t1`: Connection acquired (from pool or newly created)
   - `t2`: Request bytes sent
   - `t3`: First response byte received
   - `t4`: Last response byte received
5. Calculates latency for each request: `t4 - t0` (total) and `t3 - t2` (server processing time).
6. Records success/failure and status code.
7. Stores metrics in an efficient in-memory data structure (histogram).

### Phase 4: Metrics Flow

```
                     Worker 1           Worker 2           Worker 3
                        │                   │                   │
                        ▼                   ▼                   ▼
              ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
              │ Local histogram │ │ Local histogram │ │ Local histogram │
              │ Local counters  │ │ Local counters  │ │ Local counters  │
              └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                       │                   │                   │
                       │    Every 1 sec    │                   │
                       └───────────────────┼───────────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │  Controller  │
                                    │  (Node.js)   │
                                    └──────┬──────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                              ▼            ▼            ▼
                         Dashboard    PostgreSQL    Prometheus
```

Each worker periodically (every 1 second) sends a **compact metrics snapshot** to the controller. Not individual request data — aggregated data: total requests, error count, latency histogram, active connections.

**Why not send individual request data?**

At 1,000 RPS per worker with 3 workers, that's 3,000 individual request records per second. Over a 60-second test: 180,000 records. Over a 30-minute stress test: 5,400,000 records. Sending and storing each one is wasteful and would itself become a bottleneck.

Instead, each worker maintains a histogram (a data structure that efficiently captures the distribution of latencies) and sends the histogram + counters once per second. The controller merges histograms from all workers into a global view.

### Phase 5: Real-Time Dashboard

While the test runs, the dashboard shows:
- Current RPS (actual vs. target)
- Latency graph (P50, P95, P99 over time)
- Error rate
- Active connections per worker
- Worker health status

This data flows from Controller → Dashboard via WebSockets (a persistent bi-directional connection; we'll cover this later).

### Phase 6: Test Completion

When the duration expires (or the user stops the test):
1. The Controller tells all workers to stop.
2. Workers drain remaining in-flight requests.
3. Workers send final metrics.
4. The Controller computes final summary statistics.
5. The Controller stores the complete test result in PostgreSQL.
6. The Dashboard shows the final report.

### Phase 7: Analysis

The final report contains:
- Total requests sent
- Total requests succeeded
- Total requests failed
- Actual sustained RPS
- Latency: min, max, mean, median (P50), P90, P95, P99, P99.9
- Throughput: bytes sent, bytes received
- Error breakdown: by type (timeout, connection refused, HTTP 5xx)
- Timeline: RPS and latency over time (per-second buckets)

---

## Chapter 4: The Complete Architecture

### Evolution, Not Big Bang

We will NOT build the final architecture in one step. The system evolves through stages:

```
Stage 1: Single-threaded, single-request C++ program
            │
            ▼
Stage 2: Multi-request, sequential
            │
            ▼
Stage 3: Concurrent requests (multi-threaded)
            │
            ▼
Stage 4: Connection pooling + reuse
            │
            ▼
Stage 5: Non-blocking I/O + event loop
            │
            ▼
Stage 6: Rate-controlled request scheduling
            │
            ▼
Stage 7: Metrics collection + histograms
            │
            ▼
Stage 8: Node.js controller + API
            │
            ▼
Stage 9: React dashboard
            │
            ▼
Stage 10: Distributed workers (gRPC)
            │
            ▼
Stage 11: PostgreSQL persistence
            │
            ▼
Stage 12: Prometheus + Grafana
            │
            ▼
Stage 13: Docker + deployment
```

Each stage builds on the previous one. Each stage introduces new concepts. Each stage has a Learning Gate.

### The Final Architecture Diagram

When complete, the system looks like this:

```
                          ┌─────────────────────┐
                          │    Developer / User  │
                          └──────────┬──────────┘
                                     │
                        ┌────────────┴────────────┐
                        │                         │
                        ▼                         ▼
                   ┌─────────┐              ┌──────────┐
                   │   CLI   │              │ Web UI   │
                   │         │              │ (React)  │
                   └────┬────┘              └────┬─────┘
                        │                        │
                        └───────────┬────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │   CONTROLLER     │
                          │   (Node.js/TS)   │
                          │                  │
                          │  • API server    │
                          │  • Test manager  │
                          │  • Worker mgr    │
                          │  • Metric aggr.  │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │     gRPC    │    gRPC      │
                    ▼              ▼              ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ WORKER 1 │  │ WORKER 2 │  │ WORKER 3 │
              │ (C++)    │  │ (C++)    │  │ (C++)    │
              │          │  │          │  │          │
              │ • HTTP   │  │ • HTTP   │  │ • HTTP   │
              │   engine │  │   engine │  │   engine │
              │ • Conn   │  │ • Conn   │  │ • Conn   │
              │   pool   │  │   pool   │  │   pool   │
              │ • Metrics│  │ • Metrics│  │ • Metrics│
              └─────┬────┘  └─────┬────┘  └─────┬────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                           HTTP Traffic
                                  │
                                  ▼
                        ┌──────────────────┐
                        │  TARGET SERVER   │
                        │  (System Under   │
                        │   Test)          │
                        └──────────────────┘

              ─── Data Storage & Monitoring ───

              Controller ──► PostgreSQL (test results)
              Controller ──► Prometheus (live metrics)
              Prometheus ──► Grafana (visualization)
              Controller ──► Dashboard (WebSocket, real-time)
```

### The Two Planes

A key architectural concept: the system has two distinct "planes" of communication.

**Control Plane** — the path that commands and configuration travel:
```
User → Controller → Workers: "Start test with this config"
User → Controller → Workers: "Stop the test"
Workers → Controller: "I'm alive" (heartbeat)
Workers → Controller: "I finished"
```

**Data Plane** — the path that actual load-test traffic and metrics travel:
```
Workers → Target Server: HTTP requests (the actual load)
Target Server → Workers: HTTP responses
Workers → Controller: Metric snapshots (aggregated data)
Controller → Dashboard: Real-time metrics (via WebSocket)
Controller → PostgreSQL: Historical data
```

These are separated because they have very different requirements:

| Property | Control Plane | Data Plane |
|----------|--------------|------------|
| Volume | Low (a few messages per test) | High (thousands of requests/sec) |
| Latency requirement | Not critical (ms is fine) | Critical (must be measured accurately) |
| Reliability | Must be reliable (can't lose commands) | Tolerates some loss (one missed metric snapshot is okay) |
| Protocol | gRPC (eventually) | HTTP (for traffic) + custom metrics protocol |

This separation is a recurring pattern in distributed systems. Kubernetes has a control plane and a data plane. Networking hardware has a control plane and a data plane. CDNs have a control plane and a data plane. Understanding this pattern will serve you well beyond this project.

---

## Chapter 5: Control Plane vs Data Plane — A Deeper Look

### Why Separate Them?

Consider what happens if we sent control commands (like "stop the test") over the same channel as the load traffic. The load traffic might be so heavy that it delays or drops the stop command. The test keeps running when you told it to stop.

Or consider the reverse: if metrics data flows through the control channel, a burst of metrics could delay a heartbeat, making the controller think a worker is dead.

Separation means:
1. **Control messages are never delayed by data volume.** The "stop" command goes through a dedicated, low-traffic channel.
2. **Data volume doesn't affect system stability.** Even if metrics are temporarily delayed, the system doesn't think workers have failed.
3. **Each plane can be optimized independently.** The control plane can use reliable, ordered delivery (TCP with acknowledgments). The data plane can be optimized for throughput (compact binary encoding, batching).

### Analogy

Think of an airport:

- **Control plane:** The radio communication between the control tower and pilots. Low volume, extremely important, must be reliable. "Flight 427, you are cleared for takeoff."
- **Data plane:** The actual movement of planes, passengers, and cargo. High volume, high throughput. The physical runway and airspace.

You would never transmit air traffic control commands by writing them on a piece of luggage and hoping it gets to the right plane. The channels are separated because they have fundamentally different requirements.

### How This Applies to Our Architecture

In LoadForge:

**Control Plane messages:**
- Controller → Worker: "Here is your test configuration"
- Controller → Worker: "Start generating load"
- Controller → Worker: "Stop the test"
- Controller → Worker: "Report your status"
- Worker → Controller: "I'm registering myself as available"
- Worker → Controller: "I'm healthy" (heartbeat)
- Worker → Controller: "I encountered a fatal error"

**Data Plane flows:**
- Worker → Target: HTTP request (GET /users)
- Target → Worker: HTTP response (200 OK, body: [...])
- Worker → Controller: Metric snapshot (1-second aggregation)
- Controller → Dashboard: Live metric update (WebSocket)
- Controller → PostgreSQL: Test result batch write
- Worker → Prometheus: Prometheus scrape (metrics endpoint)

---

## Chapter 6: The Life of a Single HTTP Request

Before we can build a load generator, we need to understand what happens when a single HTTP request travels from our tool to the target server and back.

This chapter gives you the **conceptual overview**. We will go deeper into each layer (TCP, sockets, HTTP) in later chapters when we implement them.

### The Complete Journey

When our load generator sends one HTTP request, here's what happens:

```
┌─ LoadForge (our code) ────────────────────────────────────────────┐
│                                                                    │
│  1. Our code decides to send a request                            │
│  2. We construct an HTTP message:                                 │
│     GET /users HTTP/1.1                                           │
│     Host: api.myapp.com                                           │
│     Connection: keep-alive                                        │
│                                                                    │
│  3. We write this message to a SOCKET                             │
│     (a socket is our program's doorway to the network)            │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌─ Operating System ─────────────────────────────────────────────────┐
│                                                                    │
│  4. The OS kernel takes our message                               │
│  5. Wraps it in a TCP segment (adds sequence numbers, checksums)  │
│  6. Wraps THAT in an IP packet (adds source/destination IP)       │
│  7. Wraps THAT in an Ethernet frame (for local network delivery)  │
│  8. Sends it out through the network interface (NIC)              │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌─ Network ──────────────────────────────────────────────────────────┐
│                                                                    │
│  9. The packet travels through:                                   │
│     - Your local network switch/router                            │
│     - Your ISP's network                                          │
│     - Internet backbone routers                                   │
│     - Target's ISP / cloud provider network                       │
│     - Target's datacenter network                                 │
│  10. This may take 1ms (same datacenter) to 200ms (cross-globe)  │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌─ Target Server ────────────────────────────────────────────────────┐
│                                                                    │
│  11. Target's NIC receives the packet                             │
│  12. Target's kernel reassembles the TCP data                     │
│  13. The web server process reads the HTTP request from its socket│
│  14. The application processes the request                        │
│      (queries DB, runs business logic, etc.)                      │
│  15. The application constructs an HTTP response:                 │
│      HTTP/1.1 200 OK                                              │
│      Content-Type: application/json                               │
│      Content-Length: 42                                            │
│                                                                    │
│      {"users": [{"id": 1, "name": "Alice"}]}                     │
│  16. The response travels back through the same layers            │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌─ Back at LoadForge ────────────────────────────────────────────────┐
│                                                                    │
│  17. Our kernel receives the response packets                     │
│  18. Our kernel reassembles the TCP data                          │
│  19. Our code reads the response from the socket                  │
│  20. We parse the HTTP response                                   │
│  21. We record the latency: time(step 20) - time(step 1)         │
│  22. We record the status code, response size, success/failure    │
│  23. We update our metrics histogram                              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### The Layers

Notice how the data gets wrapped in layers:

```
Application layer:  HTTP message (GET /users HTTP/1.1...)
                        │
                        ▼
Transport layer:    TCP segment (sequence number, checksums, ports)
                        │
                        ▼
Network layer:      IP packet (source IP, destination IP)
                        │
                        ▼
Link layer:         Ethernet frame (MAC addresses)
                        │
                        ▼
Physical:           Electrical signals / light on the wire
```

This is the **TCP/IP network model**. Each layer adds its own header information around the data from the layer above. This is called **encapsulation**.

When the target server receives the data, it strips off each layer in reverse, like opening nested envelopes.

You don't need to memorize this stack right now. You need to know it **exists**, because later we will work directly with the TCP layer (via sockets) and the HTTP layer (constructing request messages).

### Where We Measure

As load-test engineers, we care about time at specific points:

```
t0 ──► Request scheduled (our scheduler decides it's time to send)
t1 ──► Connection acquired (from pool, or new TCP handshake completed)
t2 ──► Request bytes fully sent to the socket
t3 ──► First response byte received from the socket
t4 ──► Last response byte received, response fully parsed

Total latency     = t4 - t0  (what the "user" experiences)
Connection time   = t1 - t0  (time to get a connection)
Send time         = t2 - t1  (time to transmit the request)
Server time (TTFB)= t3 - t2  (Time To First Byte — server processing)
Download time     = t4 - t3  (time to receive the full response)
```

Each of these tells us something different about where time is being spent. If `connection time` is high, the target server is slow to accept connections. If `server time` is high, the application is slow to process requests. If `download time` is high, the response is large or the network is slow.

---

## Chapter 7: What Metrics Do We Collect?

Before we write any code, we need to understand **what we're measuring**. Otherwise, we'll build a load generator that sends traffic but tells us nothing useful.

### The Five Fundamental Metrics

Every load test revolves around five core metrics:

#### 1. Throughput (Requests Per Second — RPS)

**What it is:** How many requests the target server can handle per unit of time.

**Why it matters:** This is the server's capacity. If your target handles 1,000 RPS and your expected peak traffic is 800 RPS, you have headroom. If expected peak is 1,200 RPS, you have a problem.

**How we measure it:** Count completed requests per second.

**Subtlety:** "Throughput" can mean RPS (requests/second) or data throughput (bytes/second). We measure both, but when people say "throughput" in load testing, they usually mean RPS.

#### 2. Latency

**What it is:** How long it takes for a single request to complete, from sending to receiving the response.

**Why it matters:** Even if a server handles 10,000 RPS, if each request takes 5 seconds, users are unhappy. Latency directly affects user experience.

**How we measure it:** Record `t4 - t0` (see Chapter 6) for every request.

**Critical warning:** **Average latency is almost useless.** We'll explain why in the next section.

#### 3. Latency Distribution (Percentiles)

**What it is:** Instead of one number (the average), the full distribution of latencies.

**Why it matters:** This is one of the most important concepts in performance engineering. Let me explain with an example.

Suppose you send 100 requests:
- 95 complete in 50ms
- 4 complete in 200ms
- 1 completes in 10,000ms (10 seconds)

**Average latency:** (95×50 + 4×200 + 1×10000) / 100 = (4750 + 800 + 10000) / 100 = 155.5ms

That 155ms average looks acceptable. But **one user waited 10 seconds.** And if you have 10,000 requests per second, that's 100 users per second experiencing 10-second delays.

**Percentiles reveal this:**

| Percentile | Meaning | Value in our example |
|------------|---------|---------------------|
| P50 (median) | 50% of requests are faster than this | 50ms |
| P90 | 90% of requests are faster than this | 50ms |
| P95 | 95% of requests are faster than this | 50ms |
| P99 | 99% of requests are faster than this | 200ms |
| P99.9 | 99.9% of requests are faster than this | 10,000ms |
| Max | The slowest single request | 10,000ms |

Now the P99.9 of 10,000ms screams that something is very wrong for a small fraction of users. The average hid this. The percentiles revealed it.

**This is why every serious load-testing tool reports percentiles, not averages.**

Our tool will use a **histogram** data structure to efficiently compute percentiles. We'll build this later.

#### 4. Error Rate

**What it is:** The percentage of requests that failed.

**Types of failures we track:**

| Failure Type | What Happened |
|-------------|---------------|
| TCP connection refused | Target server isn't accepting connections |
| TCP connection timeout | Target server is too slow to accept the connection |
| Request timeout | Target server accepted the connection but didn't respond in time |
| HTTP 4xx | Client error (bad request, unauthorized, not found) |
| HTTP 5xx | Server error (internal server error, bad gateway, service unavailable) |
| Connection reset | Target server abruptly closed the connection |
| DNS resolution failure | Could not resolve the hostname |

**Why it matters:** Even a 0.1% error rate at 10,000 RPS means 10 errors per second. Over a minute, that's 600 failed requests. Whether that's acceptable depends on the service, but you need to know about it.

#### 5. Concurrency

**What it is:** How many requests are in-flight (sent but not yet completed) at any given moment.

**Why it matters:** If you configure 100 concurrent connections but you observe only 30 are active, your rate is too low (connections are idle between requests). If you observe 100 are always active and requests are queuing, your server can't keep up with the load.

**Relationship to other metrics:**

There is a fundamental relationship called **Little's Law**:

$$L = \lambda \times W$$

Where:
- $L$ = average number of concurrent requests (concurrency)
- $\lambda$ = throughput (requests per second)
- $W$ = average latency (seconds)

Example: If your server handles 500 RPS with an average latency of 200ms:

$$L = 500 \times 0.2 = 100$$

You need approximately 100 concurrent connections to sustain 500 RPS at 200ms latency. If you only open 50 connections, you cannot reach 500 RPS — the connections become the bottleneck.

This relationship will guide our connection pool sizing later.

### Secondary Metrics

Beyond the five fundamentals, we also track:

| Metric | What it tells us |
|--------|-----------------|
| Bytes sent | How much request data we're generating |
| Bytes received | How much response data we're receiving |
| Connection pool utilization | Are we using our connections efficiently? |
| Active connections | How many TCP connections are currently open |
| Queue depth | How many requests are waiting to be sent |
| Worker CPU usage | Is our load generator becoming the bottleneck? |
| Worker memory usage | Are we leaking memory? |
| Status code distribution | Breakdown of 200, 201, 400, 404, 500, 503, etc. |

### Metrics We Track About Ourselves

This is an often-overlooked but critical concept: **we need to monitor our own load generator.**

Why? Because if our load generator's CPU is at 100%, it can't send requests fast enough. The measured latency might include time the request spent waiting in *our* queue, not the server's processing time. We'd blame the target server for latency that was actually our bottleneck.

This is related to a well-known measurement problem called **coordinated omission**, which we will address later. For now, just know: **the load generator must monitor itself** and warn you when it might be affecting the results.

---

# Learning Gate #1

## Before Writing the First Line of Code

We've covered a lot of conceptual ground. Before we write any code, you need to solidify your understanding of these foundational concepts. Everything we implement depends on them.

---

### Concepts You Need to Understand

#### 1. Client-Server Model

**What it means:**

A **client** is a program that initiates a request. A **server** is a program that waits for requests and sends back responses.

This is not about physical machines — it's about roles. The same computer can run both client and server programs. In our project:

- Our C++ engine is the **client** — it initiates HTTP requests.
- The target application is the **server** — it receives and responds to those requests.
- Our Node.js controller is also a **server** — it receives API calls from the dashboard.
- Our React dashboard is a **client** — it sends API calls to the controller.

The client-server model is the fundamental interaction pattern of the internet. Every website you visit, every API you call, every database query — they all follow this pattern.

**Why this project needs it:** We are building a client (the load generator) that is specifically designed to stress-test servers. Understanding what a client does and what a server does is the absolute foundation.

**Where it's used:** Everywhere. The C++ engine is a client to the target server. The dashboard is a client to the controller API. Workers are clients that register with the controller.

---

#### 2. What an HTTP Request Actually Is

**What it means:**

HTTP (HyperText Transfer Protocol) is a text-based protocol for transferring data. An HTTP request is literally a structured text message sent from a client to a server.

Here is an actual HTTP/1.1 request, byte for byte:

```
GET /api/users HTTP/1.1\r\n
Host: api.myapp.com\r\n
Accept: application/json\r\n
Connection: keep-alive\r\n
\r\n
```

This is not JSON. This is not binary. This is plain text with specific formatting rules:

- **Line 1 (request line):** `METHOD PATH VERSION`
  - `GET` = the HTTP method (I want to retrieve data)
  - `/api/users` = the path I'm requesting
  - `HTTP/1.1` = the protocol version
- **Lines 2-4 (headers):** `Key: Value` pairs providing metadata
  - `Host` = which server I'm talking to (important for virtual hosting)
  - `Accept` = what format I want the response in
  - `Connection: keep-alive` = please don't close the connection after this request
- **Empty line:** Separates headers from body (this request has no body)
- **`\r\n`** = carriage return + line feed (the line ending HTTP requires)

And here is what the server sends back — an HTTP response:

```
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Content-Length: 42\r\n
\r\n
{"users": [{"id": 1, "name": "Alice"}]}
```

- **Line 1 (status line):** `VERSION STATUS_CODE REASON`
- **Lines 2-3 (headers):** Response metadata
- **Empty line:** Separator
- **Body:** The actual data

**Why this project needs it:** We are building an HTTP load generator. We need to construct these messages ourselves (at least conceptually — we may use a library for parsing, but we need to understand the format). We need to parse the responses to check status codes and measure response sizes.

**Where it's used:** This is the core of what our C++ engine does — it constructs HTTP requests, sends them over a network connection, and parses the HTTP responses.

---

#### 3. Latency

**What it means:**

Latency is the time between initiating an action and getting the result. In our context, it's the time between sending an HTTP request and receiving the complete response.

Latency is measured in time units:
- **Milliseconds (ms):** 1ms = 0.001 seconds. Most API latencies are in this range.
- **Microseconds (μs):** 1μs = 0.001ms. Used for very fast operations.
- **Nanoseconds (ns):** 1ns = 0.001μs. Used for CPU-level measurements.

Latency is NOT the same as speed. A fast server with a slow network has high latency. A slow server with a fast network also has high latency. Latency is the total end-to-end time.

**Components of latency:**
```
Total latency = Network latency (out) + Server processing time + Network latency (back)
```

In practice, for our measurements:
```
Total latency = Connection time + Request send time + Server processing + Response download
```

**Why this project needs it:** Latency is one of the core metrics we report. We need to measure it accurately (using high-resolution clocks), store it efficiently (using histograms), and report it meaningfully (using percentiles).

**Where it's used:** Every single request gets a latency measurement. The C++ engine timestamps each request at multiple points.

---

#### 4. Throughput (RPS)

**What it means:**

Throughput is the rate of work completed per unit time. In load testing, it's typically measured as **Requests Per Second (RPS)** — how many complete request-response cycles happen each second.

Important distinction:
- **Offered load:** The rate at which we *try* to send requests (configured by the user).
- **Achieved throughput:** The rate at which requests actually *complete*.

If you configure 1,000 RPS but the server can only handle 600, the achieved throughput will be ~600 RPS, and the remaining 400 requests/second will be queuing, timing out, or failing.

**Why this project needs it:** We need to generate a *specific* rate of traffic (rate control) and measure the *actual* rate of completions (throughput measurement). These are two different things.

**Where it's used:** The request scheduler in the C++ engine controls the offered load. The metrics system counts completions per second for achieved throughput.

---

#### 5. Percentiles

**What it means:**

A percentile tells you what percentage of values fall below a given threshold.

- **P50 (median):** 50% of values are below this. This is the "typical" experience.
- **P95:** 95% of values are below this. 1 in 20 is worse.
- **P99:** 99% of values are below this. 1 in 100 is worse.
- **P99.9:** 99.9% of values are below this. 1 in 1,000 is worse.

**Why percentiles instead of averages?**

Averages can hide horrible worst-case behavior. Consider:

```
99 requests at 10ms, 1 request at 10,000ms

Average = (99 × 10 + 1 × 10000) / 100 = 109.9ms    ← Looks okay!
P99 = 10,000ms                                       ← One in 100 users waits 10 seconds!
```

In a production system serving millions of requests, that 1% is thousands of angry users.

**Why this project needs it:** We report P50, P95, P99, and P99.9 for every load test. We need a data structure (histogram) that can compute these efficiently without storing every individual latency value.

**Where it's used:** The metrics system in the C++ engine. The reporting system in the controller. The latency graphs on the dashboard.

---

#### 6. Error Rate

**What it means:**

The fraction of requests that failed, expressed as a percentage.

```
Error rate = (failed requests / total requests) × 100%
```

An error can be:
- A network error (connection refused, timeout, connection reset)
- An HTTP error (status codes 4xx or 5xx)

Whether HTTP 4xx counts as an "error" depends on context. A 404 from a load test might be expected (maybe we're testing the error-handling path). A 500 is almost always a real error.

**Why this project needs it:** Error rate is a critical health signal. A load test isn't just about speed — it's about correctness under load. A server that responds in 1ms but fails 50% of the time is broken.

**Where it's used:** Every request result is classified as success/failure. The metrics system tracks error counts and error types.

---

#### 7. The Difference Between the Load Generator and the Target Server

**What it means:**

This is worth repeating because confusion here leads to fundamental misunderstandings:

| | Load Generator (LoadForge) | Target Server |
|---|---|---|
| Role | Client — sends requests | Server — receives and processes requests |
| We control | Everything — rate, concurrency, duration | Nothing — it's someone else's code |
| We measure | Request timing, errors, throughput | (Only indirectly, through our observations) |
| Performance goal | Generate load efficiently, don't become a bottleneck | Handle the load |
| Failure meaning | Bug in our tool | The target can't handle the load (which is useful information!) |

**Critical insight:** If our load generator can't keep up with the configured rate (e.g., we configured 10,000 RPS but we can only generate 3,000), then **our tool is the bottleneck**, not the target server. Our results become meaningless. This is why we must monitor our own load generator's performance.

---

### Exercises

Do these **before** we start coding. Write your answers down (even just in a text file). These verify that you understand the foundations.

#### Exercise 1: Identify the Roles
You configure LoadForge to send requests to `https://api.myapp.com`. Which is the client? Which is the server? If you then open the LoadForge dashboard in your browser, which is the client and which is the server in *that* interaction?

#### Exercise 2: Read an HTTP Request
Given this HTTP request:
```
POST /api/orders HTTP/1.1
Host: shop.example.com
Content-Type: application/json
Content-Length: 27

{"item": "book", "qty": 2}
```
Answer:
- What HTTP method is being used?
- What path is being requested?
- What is the request body?
- What does Content-Length represent?

#### Exercise 3: Calculate Percentiles
Given these latencies (in ms) for 20 requests:
```
12, 13, 11, 14, 12, 250, 11, 13, 12, 15,
12, 13, 11, 12, 14, 13, 12, 11, 13, 12
```
- What is the average latency?
- Sort the values and find P50 (median).
- Find P95 (the value at the 95th percentile).
- Which metric (average or P95) better reveals the outlier?

#### Exercise 4: Little's Law
Your target server handles requests with an average latency of 100ms. You want to achieve 2,000 RPS. Using Little's Law ($L = \lambda \times W$), how many concurrent connections do you need?

#### Exercise 5: Error Rate
During a 60-second test at 500 RPS, you observe:
- 29,500 successful responses (HTTP 200)
- 300 HTTP 503 errors
- 200 connection timeouts
What is the total error rate? What is the total number of requests? Does it match the expected total (500 × 60)?

#### Exercise 6: Why Not Averages?
A server handles 1,000,000 requests. 999,990 complete in 5ms. 10 complete in 30 seconds. Calculate the average latency and the P99.999 latency. Which number would you put on a status page to represent user experience?

#### Exercise 7: Load Generator as Bottleneck
You configure LoadForge for 10,000 RPS. You observe that your load-generator machine's CPU is at 100% and the achieved RPS is only 6,000. The target server's CPU is at 40%. What is happening? Whose numbers should you trust?

---

### What Comes After Learning Gate #1

Once you've worked through these exercises and are comfortable with these concepts, we will proceed to:

**Milestone 1: Project Setup and Sending One HTTP Request**

This will introduce:
- Setting up a C++ project with CMake
- TCP sockets (what they are, how they work)
- The BSD socket API
- Sending raw bytes over a network connection
- Constructing an HTTP request by hand
- Reading an HTTP response
- Measuring latency with `std::chrono`

This will bring **Learning Gate #2**, which will cover:
- What a process is
- What a socket is
- What a file descriptor is
- Blocking I/O
- The TCP three-way handshake

We will build up from there, one concept at a time.

---

*End of Part I. Continue to Part II after completing Learning Gate #1 exercises.*
