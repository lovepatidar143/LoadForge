# LoadForge Systems Engineering: Parts XXV–XXVIII (Expanded Edition)

## PART XXV — COMPLETE SOURCE CODE WALKTHROUGH

This section provides an exhaustive, line-by-line architectural breakdown of the LoadForge C++ engine. As a systems engineer, understanding the boundaries between components, the threading models, and memory ownership semantics is critical for maintaining and scaling LoadForge. 

In this chapter, we will examine the actual source code of the most performance-critical components.

### 1. Network I/O: The `Socket` Class

The `Socket` class is a POSIX socket wrapper that ensures safe RAII (Resource Acquisition Is Initialization) semantics.

**FILE:** `engine/src/socket.cpp`

```cpp
bool Socket::connect(const std::string& host, int port, int timeout_ms) {
    if (connected_) return true;
    
    struct addrinfo hints, *res, *p;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    
    std::string port_str = std::to_string(port);
    if (getaddrinfo(host.c_str(), port_str.c_str(), &hints, &res) != 0) {
        return false;
    }
    
    for (p = res; p != nullptr; p = p->ai_next) {
        fd_ = ::socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (fd_ == -1) continue;
        
        // Set non-blocking
        int flags = fcntl(fd_, F_GETFL, 0);
        fcntl(fd_, F_SETFL, flags | O_NONBLOCK);
        
        int status = ::connect(fd_, p->ai_addr, p->ai_addrlen);
        if (status == -1 && errno != EINPROGRESS) {
            close();
            continue;
        }
        
        if (status == 0) {
            connected_ = true;
            break;
        }
        
        struct pollfd pfd;
        pfd.fd = fd_;
        pfd.events = POLLOUT;
        
        if (poll(&pfd, 1, timeout_ms) > 0) {
            int err = 0;
            socklen_t errlen = sizeof(err);
            getsockopt(fd_, SOL_SOCKET, SO_ERROR, &err, &errlen);
            if (err == 0) {
                connected_ = true;
                break;
            }
        }
        
        close();
    }
    
    freeaddrinfo(res);
    return connected_;
}
```

**Line-by-Line Explanation:**
1. `if (connected_) return true;`: Idempotency guard. If the socket is already established (e.g., retrieved from the `ConnectionPool`), skip connection establishment.
2. `getaddrinfo(...)`: Synchronous DNS resolution. Resolves the hostname to a list of IP addresses (IPv4 or IPv6).
3. `for (p = res; p != nullptr; p = p->ai_next)`: Iterate through the resolved IP addresses, attempting to connect to the first available one.
4. `fd_ = ::socket(...)`: System call to create an endpoint for communication. Returns a file descriptor.
5. `fcntl(fd_, F_SETFL, flags | O_NONBLOCK)`: **CRITICAL STEP**. The socket is placed in non-blocking mode. If it were blocking, the `::connect` call would block the thread indefinitely, defying our timeout mechanism.
6. `::connect(fd_, p->ai_addr, p->ai_addrlen)`: Initiates the TCP 3-way handshake. Because the socket is non-blocking, this usually returns `-1` with `errno == EINPROGRESS`.
7. `struct pollfd pfd; ... poll(&pfd, 1, timeout_ms)`: Uses the `poll` system call to wait for the socket to become writable (`POLLOUT`), which indicates the 3-way handshake has completed. It respects the `timeout_ms`.
8. `getsockopt(fd_, SOL_SOCKET, SO_ERROR, &err, &errlen)`: Just because `poll` returned doesn't mean the connection was successful (it could be a `RST`). We check the socket error state. If `err == 0`, connection succeeded.

---

### 2. HTTP Protocol Implementation

**FILE:** `engine/src/http_client.cpp`

The `HttpClient` is responsible for serializing the request, transmitting it, and orchestrating the parser.

```cpp
RequestResult HttpClient::execute(Socket& sock, const HttpRequest& req, int timeout_ms) {
    RequestResult result;
    result.success = false;
    
    auto start_time = std::chrono::steady_clock::now();
    
    std::string req_str = req.method + " " + req.path + " HTTP/1.1\r\n";
    req_str += "Host: " + req.host + "\r\n";
    for (const auto& h : req.headers) {
        if (h.first != "Host" && h.first != "Connection") {
            req_str += h.first + ": " + h.second + "\r\n";
        }
    }
    if (req.headers.find("Connection") != req.headers.end()) {
        req_str += "Connection: " + req.headers.at("Connection") + "\r\n";
    } else {
        req_str += "Connection: close\r\n";
    }
    
    if (!req.body.empty()) {
        req_str += "Content-Length: " + std::to_string(req.body.length()) + "\r\n";
    }
    req_str += "\r\n";
    req_str += req.body;
    
    ssize_t sent = sock.send(req_str.c_str(), req_str.length());
    if (sent <= 0) {
        result.error_type = "send_failed";
        return result;
    }
    result.bytes_sent = sent;
    
    char buffer[8192];
    std::string response_data;
    HttpParser parser;
    bool headers_done = false;
    
    while (true) {
        ssize_t bytes = sock.recv(buffer, sizeof(buffer), timeout_ms);
        if (bytes < 0) {
            result.error_type = "recv_timeout";
            break;
        }
        if (bytes == 0) {
            if (!headers_done || !parser.is_complete()) {
                result.error_type = "connection_closed_early";
            }
            break;
        }
        
        result.bytes_received += bytes;
        
        if (!headers_done) {
            size_t parsed = parser.parse(buffer, bytes);
            if (parser.has_error()) {
                result.error_type = "parse_error";
                break;
            }
            if (parser.is_complete()) {
                headers_done = true;
                result.success = true;
                result.response.status_code = parser.status_code();
                result.response.keep_alive = parser.keep_alive();
                break;
            }
        }
    }
    
    auto end_time = std::chrono::steady_clock::now();
    result.total_time_us = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
    
    return result;
}
```

**Line-by-Line Explanation:**
1. `std::string req_str = req.method ...`: String concatenation builds the HTTP/1.1 raw payload. This includes injecting the vital `Host` header and `Content-Length`.
2. `sock.send(...)`: Pushes the string buffer down to the kernel.
3. `char buffer[8192]`: Stack-allocated buffer for receiving. Stack allocation is extremely fast and avoids heap contention in highly concurrent environments.
4. `sock.recv(buffer, sizeof(buffer), timeout_ms)`: Reads from the socket. `bytes < 0` implies a timeout or socket error. `bytes == 0` implies the server sent a TCP `FIN` packet (connection closed).
5. `parser.parse(buffer, bytes)`: Pushes the read buffer into our incremental HTTP parser. This continues looping until `parser.is_complete()` becomes true.
6. `result.total_time_us = ...`: Calculates wall-clock latency spanning the entire serialize -> send -> receive -> parse lifecycle.

**FILE:** `engine/src/http_parser.cpp`

```cpp
size_t HttpParser::parse(const char* data, size_t len) {
    if (complete_ || error_) return 0;
    
    buffer_.append(data, len);
    
    if (state_ == State::STATUS_LINE) {
        size_t pos = buffer_.find("\r\n");
        if (pos != std::string::npos) {
            std::string line = buffer_.substr(0, pos);
            buffer_.erase(0, pos + 2);
            
            size_t space1 = line.find(' ');
            size_t space2 = line.find(' ', space1 + 1);
            
            if (space1 != std::string::npos && space2 != std::string::npos) {
                status_code_ = std::stoi(line.substr(space1 + 1, space2 - space1 - 1));
                state_ = State::HEADERS;
            } else {
                error_ = true;
                return len;
            }
        }
    }
    
    if (state_ == State::HEADERS) {
        while (true) {
            size_t pos = buffer_.find("\r\n");
            if (pos == std::string::npos) break;
            
            if (pos == 0) {
                buffer_.erase(0, 2);
                state_ = State::BODY;
                break;
            }
            
            std::string line = buffer_.substr(0, pos);
            buffer_.erase(0, pos + 2);
            
            size_t colon = line.find(':');
            if (colon != std::string::npos) {
                std::string key = line.substr(0, colon);
                std::string val = line.substr(colon + 1);
                
                key.erase(0, key.find_first_not_of(" \t"));
                key.erase(key.find_last_not_of(" \t") + 1);
                val.erase(0, val.find_first_not_of(" \t"));
                val.erase(val.find_last_not_of(" \t") + 1);
                
                std::transform(key.begin(), key.end(), key.begin(), ::tolower);
                headers_[key] = val;
                
                if (key == "content-length") {
                    content_length_ = std::stoull(val);
                } else if (key == "connection" && val == "keep-alive") {
                    keep_alive_ = true;
                }
            }
        }
    }
    
    if (state_ == State::BODY) {
        body_read_ += buffer_.length();
        buffer_.clear();
        
        if (content_length_ == 0 || body_read_ >= content_length_) {
            complete_ = true;
        }
    }
    
    return len;
}
```
**Explanation:**
This acts as a rudimentary State Machine (`STATUS_LINE` -> `HEADERS` -> `BODY`). It buffers incoming bytes until it finds a `\r\n`, extracts the HTTP status code using string indexing, standardizes header keys to lowercase, and extracts `content-length` and `keep-alive` to manage connection lifetime.

---

### 3. Resource Management: `ConnectionPool`

Connection multiplexing is vital for achieving high RPS. Re-establishing a TCP connection + TLS handshake for every request would overwhelm the client OS.

**FILE:** `engine/src/connection_pool.cpp`

```cpp
Socket ConnectionPool::acquire(int timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (!pool_.empty()) {
        Socket sock = std::move(pool_.back());
        pool_.pop_back();
        active_count_++;
        return sock;
    }
    
    if (active_count_ < max_connections_) {
        active_count_++;
        lock.unlock();
        
        Socket sock;
        sock.connect(host_, port_, timeout_ms);
        return sock;
    }
    
    if (cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms), 
        [this] { return !pool_.empty() || active_count_ < max_connections_; })) {
        
        if (!pool_.empty()) {
            Socket sock = std::move(pool_.back());
            pool_.pop_back();
            active_count_++;
            return sock;
        } else {
            active_count_++;
            lock.unlock();
            
            Socket sock;
            sock.connect(host_, port_, timeout_ms);
            return sock;
        }
    }
    
    return Socket();
}

void ConnectionPool::release(Socket&& sock) {
    if (!sock.is_connected()) {
        discard(std::move(sock));
        return;
    }
    
    std::lock_guard<std::mutex> lock(mutex_);
    pool_.push_back(std::move(sock));
    active_count_--;
    cv_.notify_one();
}
```

**Explanation:**
- **Acquire**: 
  1. If a socket is idle in `pool_`, grab it (LIFO order improves cache locality on target servers).
  2. If the pool is empty but `active_count_ < max_connections_`, bypass the queue, increment active count, drop the lock, and dial a brand new connection.
  3. If we are at connection limits, `cv_.wait_for` blocks the calling thread until a socket is released.
- **Release**: Pushes the socket back onto the vector and calls `notify_one()` to wake up one of the waiting threads.

---

### 4. Threading: `ThreadPool`

**FILE:** `engine/src/thread_pool.cpp`

```cpp
ThreadPool::ThreadPool(size_t num_threads) : stop_(false) {
    for (size_t i = 0; i < num_threads; ++i) {
        workers_.emplace_back([this] {
            while (true) {
                std::function<void()> task;
                
                {
                    std::unique_lock<std::mutex> lock(queue_mutex_);
                    condition_.wait(lock, [this] { 
                        return stop_ || !tasks_.empty(); 
                    });
                    
                    if (stop_ && tasks_.empty()) {
                        return;
                    }
                    
                    task = std::move(tasks_.front());
                    tasks_.pop();
                }
                
                task();
            }
        });
    }
}

void ThreadPool::submit(std::function<void()> task) {
    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        if (stop_) return;
        tasks_.push(std::move(task));
    }
    condition_.notify_one();
}
```
**Explanation:** 
A classic fixed-size worker pool. Workers sit inside an infinite loop blocking on `condition_.wait()`. The main thread packages HTTP request logic into a `std::function<void()>` closure and places it in the `tasks_` queue.

---

### 5. Pacing: `RateLimiter`

**FILE:** `engine/src/rate_limiter.cpp`

```cpp
void RateLimiter::acquire() {
    if (rate_ <= 0) return;
    
    std::unique_lock<std::mutex> lock(mutex_);
    
    while (tokens_ < 1.0) {
        auto now = std::chrono::steady_clock::now();
        double elapsed_s = std::chrono::duration<double>(now - last_update_).count();
        
        tokens_ += elapsed_s * rate_;
        if (tokens_ > rate_) tokens_ = rate_;
        last_update_ = now;
        
        if (tokens_ < 1.0) {
            double wait_s = (1.0 - tokens_) / rate_;
            cv_.wait_for(lock, std::chrono::duration<double>(wait_s));
        }
    }
    
    tokens_ -= 1.0;
}
```
**Explanation:**
An implementation of the Token Bucket algorithm. If `tokens_` drops below 1.0, the thread calculates exactly how long it must wait for the bucket to refill (`wait_s = (1.0 - tokens_) / rate_`) and puts itself to sleep with `cv_.wait_for`. This ensures perfectly smooth traffic shaping without burning CPU cycles in a spin-lock.

---

### 6. Metrics & Aggregation

**FILE:** `engine/src/histogram.cpp`

```cpp
void Histogram::record(double value) {
    std::lock_guard<std::mutex> lock(mutex_);
    count_++;
    sum_ += value;
    if (value < min_ || count_ == 1) min_ = value;
    if (value > max_) max_ = value;
    
    // Logarithmic bucketing
    if (value <= 0) return;
    int bucket = std::log2(value) * 10; 
    if (bucket < 0) bucket = 0;
    if (bucket >= 1000) bucket = 999;
    buckets_[bucket]++;
}

double Histogram::percentile(double p) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (count_ == 0) return 0;
    if (p <= 0) return min_;
    if (p >= 100) return max_;
    
    uint64_t target = (p / 100.0) * count_;
    uint64_t accumulated = 0;
    
    for (const auto& pair : buckets_) {
        accumulated += pair.second;
        if (accumulated >= target) {
            return std::pow(2.0, pair.first / 10.0);
        }
    }
    return max_;
}
```
**Explanation:**
To calculate P99 latencies dynamically without storing millions of floats in memory (which would cause a massive garbage collection/deallocation lag), LoadForge uses logarithmic bucketing. By taking `std::log2(value) * 10`, it bins latencies into buckets. When `percentile` is called, it iterates through the sorted bins until it reaches the target request count.

**FILE:** `engine/src/engine.cpp` (The Core Loop)

```cpp
MetricsSnapshot LoadEngine::run() {
    running_ = true;
    stop_requested_ = false;
    
    std::thread reporter(&LoadEngine::metrics_reporter_loop, this);
    
    auto start_time = std::chrono::steady_clock::now();
    
    while (!stop_requested_) {
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(now - start_time).count();
        
        if (config_.duration_seconds > 0 && elapsed >= config_.duration_seconds) {
            break;
        }
        
        double current_rate = calculate_current_rate(elapsed);
        limiter_->set_rate(current_rate);
        
        limiter_->acquire();
        if (stop_requested_) break;
        
        thread_pool_->submit([this] {
            execute_request();
        });
    }
    
    thread_pool_->shutdown();
    running_ = false;
    if (reporter.joinable()) reporter.join();
    
    return metrics_->final_snapshot();
}
```
**Explanation:**
The main loop checks time boundaries, adjusts the RPS for ramp-up via `calculate_current_rate`, blocks on the rate limiter, and fires off `execute_request()` to the thread pool. 

---

## PART XXVI — COMPLETE REQUEST WALKTHROUGH

Let us trace a single HTTP request, mapping it directly to the source code paths outlined above.

1. **Start**: The user submits the form in React. The Node.js controller receives `POST /api/tests`.
2. **Distribution**: The controller invokes `WorkerClient.startTest()`, sending a POST to the C++ worker.
3. **Engine Initialization**: The worker receives the config, instantiates `LoadEngine`, and calls `run()`.
4. **Acquiring Token**: Inside `run()`, the main thread blocks on `limiter_->acquire()`. It calculates the sleep duration based on the token bucket and wakes up when a token is granted.
5. **Dispatching**: `thread_pool_->submit(...)` pushes the job to the queue. `condition_.notify_one()` wakes up a background thread.
6. **Execution Starts**: A thread unblocks in `thread_pool.cpp` line 9, pops the closure, and executes `LoadEngine::execute_request()`.
7. **Connection**: It calls `pool_->acquire()`. Since the pool is empty initially, it falls through to `sock.connect()`.
8. **Network Handshake**: Inside `socket.cpp`, it performs `getaddrinfo`, sets `O_NONBLOCK`, initiates `::connect`, and blocks on `poll()` waiting for the TCP `SYN-ACK`.
9. **Transmitting Data**: Back in `execute_request`, it passes the socket to `HttpClient::execute()`. String manipulation builds the `GET` request. `sock.send()` pushes it to the kernel.
10. **Receiving Data**: The thread blocks on `sock.recv()` utilizing `poll()`.
11. **Parsing**: When bytes arrive, they are pushed into `HttpParser::parse()`. The state machine progresses `STATUS_LINE -> HEADERS -> BODY`. `keep_alive_` is set to true.
12. **Metrics**: The `HttpClient` measures the elapsed `std::chrono` delta and returns `RequestResult`.
13. **Recording**: `metrics_->record_request(result)` atomics are incremented. The latency is `std::log2()` binned into the `Histogram`.
14. **Cleanup**: `execute_request` determines `result.response.keep_alive` is true, so it calls `pool_->release(sock)`.

---

## PART XXVII — COMPLETE TEST WALKTHROUGH

**Configuration:** Target: `/api/users`, RPS: 1,000, Duration: 30s, Workers: 2, Ramp-up: 5s.
The controller splits this to **500 RPS per worker**.

**T = 0s (Initialization):** 
- Connections: 0
- RPS: 0

**T = 1s (Ramp-up phase):** 
- `calculate_current_rate(1.0)` -> 500 * (1/5) = 100 RPS per worker.
- The RateLimiter dispenses 100 tokens per second.
- ThreadPool spawns 100 tasks. Since pools are empty, 100 TCP handshakes are initiated.
- Expected metrics snapshot: `current_rps: 200` (aggregated across 2 workers), `active_connections: 200`, `latency_p50_ms: ~15ms` (includes connection setup overhead).

**T = 5s (Entering Steady State):** 
- `calculate_current_rate(5.0)` -> 500 RPS per worker.
- The thread pool utilizes the existing keep-alive connections. No new TCP handshakes occur.
- Expected metrics snapshot: `current_rps: 1000`, `active_connections: 200` (holding steady), `latency_p50_ms: ~5ms` (fast, no TCP overhead).

**T = 15s (Mid-Test):** 
- Stable throughput. `tokens_` in RateLimiter never drops far below 1.0 because tasks process rapidly.
- P99 latency remains stable unless the target server experiences garbage collection.

**T = 30s (Completion):** 
- `elapsed >= config_.duration_seconds` evaluates true in `run()`. The loop breaks.
- `thread_pool_->shutdown()` blocks until all active requests complete.
- ConnectionPool destructs, issuing TCP `FIN` across all sockets.
- The controller aggregates `final_snapshot()`.

---

## PART XXVIII — FAILURE WALKTHROUGHS

Systems engineering is fundamentally about understanding and mitigating failure.

### Scenario 1: Target Server Crashes (Connection Refused)
- **Mechanism**: The target server process dies. The OS kernel actively rejects connections with a `RST` packet.
- **Code Path**: `Socket::connect`'s `poll()` loop detects an error. `getsockopt` sets `err` to `ECONNREFUSED`. `connect()` returns `false`.
- **Metrics Change**: `HttpClient` fails. `metrics_->record_request` is invoked with `success = false` and `error_type = "pool_timeout"` or `"send_failed"`.
- **Dashboard Output**: `current_rps` (successful) plummets to 0. `failed_requests` spikes to 1000/sec. Error map shows `{ "connection_refused": 1000 }`.

### Scenario 2: Worker Crashes Mid-Test
- **Mechanism**: OOM Killer terminates a worker container.
- **Code Path**: Controller's `worker-manager.ts` heartbeat `setInterval` ping receives no response. Marks worker `OFFLINE`.
- **Metrics Change**: Aggregator merges 1 snapshot instead of 2. Total RPS instantly halves from 1,000 to 500.
- **Dashboard Output**: UI toast: "Warning: Lost connection to worker node-2".

### Scenario 3: Controller Crashes
- **Mechanism**: Node.js throws `ERR_UNHANDLED_REJECTION`.
- **System Behavior**: Workers are autonomous. They continue executing their C++ `run()` loops. They continue saturating the target server.
- **Impact**: When workers finish, they hold the `MetricsSnapshot` in memory. With the controller dead, no process asks for the data. The results are permanently lost.

### Scenario 4: Network Connection Resets (Firewall Drop)
- **Mechanism**: Stateful firewall drops idle keep-alive connections.
- **Code Path**: `sock.recv()` returns `0` bytes immediately on a previously idle connection.
- **Impact**: `HttpClient` sets `error_type = "connection_closed_early"`. The socket is discarded via `pool_->discard()`. The next request forces a new TCP handshake. P99 latency spikes slightly due to the re-connection penalty.

### Scenario 5: Target Becomes Extremely Slow
- **Mechanism**: Target database locks up. Response time jumps to 5 seconds.
- **Code Path**: `sock.recv()` blocks for the full timeout duration. `pool_->acquire()` is starved because no sockets are being released.
- **Metrics Change**: `active_connections` maxes out. `queue_depth` inside `ThreadPool` grows exponentially as `RateLimiter` keeps dispensing tokens but threads are blocked. 
- **Impact**: **Coordinated Omission**. Throughput falls drastically. The system correctly identifies the severe slowdown, logging huge P99 values.

### Scenario 6: Load Generator Cannot Achieve Requested RPS
- **Mechanism**: User requests 1,000,000 RPS on a 2-core VM.
- **Code Path**: `RateLimiter` grants tokens, but `thread_pool_->submit` fills the queue faster than threads can wake up. The OS context-switching overhead completely starves the process.
- **Metrics Change**: `worker_cpu_percent` reports 100%. `current_rps` peaks at hardware limit (e.g., 45,000).
- **Diagnosis**: Results are unreliable. The user must scale horizontally by adding more workers to the pool.

### Scenario 7: Database Becomes Unavailable
- **Mechanism**: PostgreSQL connection drops.
- **Code Path**: Controller gracefully handles `QueryFailedError`. `isDbConnected` becomes false.
- **Impact**: The test executes perfectly in memory. Real-time WebSockets remain unaffected. At the end of the test, saving to DB fails. Results remain cached in RAM.

### Scenario 8: Prometheus Becomes Unavailable
- **Mechanism**: Prometheus sidecar crashes.
- **Impact**: Zero impact. LoadForge uses internal atomic metrics collection. Prometheus scraping `/metrics` failing merely stops external Grafana dashboards. The LoadForge UI and core test loop are unaffected.
