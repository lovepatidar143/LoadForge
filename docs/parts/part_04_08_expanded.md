# LoadForge Systems Engineering: Parts IV - VIII

## PART IV — BUILDING THE FIRST LOAD GENERATOR (Chapters 97-110)

### Chapter 97: Repository Setup

Before writing a single line of C++ for a high-performance system like LoadForge, defining a solid repository structure is non-negotiable. Systems software is intricate, managing networking, threading, build configurations, and tests. A monolithic directory quickly becomes unmaintainable. 

Here is the comprehensive repository structure we employ for LoadForge:

```text
LoadForge/
├── engine/              # Core C++ high-performance load generation engine
│   ├── src/             # Implementation files (.cpp)
│   ├── include/         # Public headers (.h)
│   └── tests/           # CTest/GTest unit tests
├── controller/          # Go-based distributed cluster controller
├── frontend/            # React/TypeScript web interface for test visualization
├── docker/              # Dockerfiles for containerization
├── scripts/             # Deployment and utility scripts (bash/python)
├── docs/                # Architecture diagrams and API documentation
├── proto/               # gRPC Protobuf definitions for inter-process communication
└── CMakeLists.txt       # Root build configuration
```

**Why this structure?**
LoadForge is designed as a distributed system. The `engine/` directory must be written in a low-level language like C++ to achieve raw speed, deterministic memory management, and complete control over system calls (like `poll` or `epoll`). C++ allows us to bypass heavy runtimes and garbage collectors that introduce unpredictable latency spikes. On the other hand, the `controller/` is written in Go, which provides superior abstractions for concurrency, web serving, and cluster orchestration. By separating the codebase logically by domain and language, we ensure that the C++ build system does not conflict with Go modules. The `proto/` directory acts as the strict typed contract (gRPC) bridging the C++ engine workers and the Go controller.

### Chapter 98: Build System (CMake)

For C++ projects, CMake is the de facto standard. It provides a platform-independent way to describe the build process, seamlessly generating Makefiles or Ninja build files.

Here is the root `CMakeLists.txt` philosophy used in the LoadForge engine. We enforce the C++17 standard to utilize modern language features.

```cmake
cmake_minimum_required(VERSION 3.10)
project(LoadForgeEngine VERSION 0.1.0 LANGUAGES CXX)

# Enforce C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Strict warnings to catch bugs early
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wpedantic")

# Include directories for public headers
include_directories(include)

# Source files
set(SOURCES
    src/main.cpp
    src/engine.cpp
    src/socket.cpp
    src/thread_pool.cpp
    src/rate_limiter.cpp
    src/metrics.cpp
    src/histogram.cpp
    src/http_parser.cpp
    src/http_client.cpp
    src/connection_pool.cpp
)

# Define the primary executable
add_executable(loadforge ${SOURCES})

# Link POSIX threading library
target_link_libraries(loadforge pthread)
```

**Compiler Flags Explained:**
- `-Wall -Wextra`: Enables a comprehensive set of warnings. In systems programming, warnings are often latent bugs waiting to corrupt memory.
- `-Wpedantic`: Ensures strict ISO C++ compliance, preventing the use of compiler-specific extensions (like GCC's variable-length arrays), which hurts portability.
- `CMAKE_CXX_EXTENSIONS OFF`: Disables GNU extensions (`-std=gnu++17`), forcing standard `-std=c++17`.

**Linking the Threading Library:**
`target_link_libraries(loadforge pthread)` is absolutely crucial. LoadForge spawns multiple threads to handle concurrent socket connections. Without explicitly linking the POSIX thread library (`pthread`), the linker will fail to resolve `std::thread` and `std::mutex` symbols on Linux systems, leading to cryptic `undefined reference` errors during the final linkage phase.

### Chapter 99-100: First C++ Executable and CLI

The entry point of the LoadForge engine is `src/main.cpp`. It acts as the orchestrator: parsing user intents, constructing the configuration, instantiating the engine, and printing the results.

```cpp
#include "loadforge/engine.h"
#include <iostream>
#include <iomanip>

using namespace loadforge;

int main(int argc, char* argv[]) {
    std::cout << "LoadForge v0.1.0\n";
    
    Config config;
    // Sensible defaults
    config.target_url = "http://example.com/";
    config.duration_seconds = 1;
    config.requests_per_second = 10;
    
    // Naive CLI parsing
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--url" && i + 1 < argc) config.target_url = argv[++i];
        if (arg == "--duration" && i + 1 < argc) config.duration_seconds = std::stoi(argv[++i]);
        if (arg == "--rate" && i + 1 < argc) config.requests_per_second = std::stoi(argv[++i]);
    }
    
    std::cout << "Target: " << config.target_url << "\n";
    std::cout << "Duration: " << config.duration_seconds << "s\n";
    
    LoadEngine engine(config);
    
    // Real-time metric callbacks
    engine.set_metrics_callback([](const MetricsSnapshot& s) {
        std::cout << "RPS: " << s.current_rps << " | Active conn: " << s.active_connections << "\n";
    });
    
    // Blocking call that executes the test
    MetricsSnapshot final_metrics = engine.run();
    
    std::cout << "\nTest Complete!\n";
    std::cout << "Total Requests: " << final_metrics.total_requests << "\n";
    std::cout << "Successful: " << final_metrics.successful_requests << "\n";
    std::cout << "Failed: " << final_metrics.failed_requests << "\n";
    std::cout << "Latency P50 (ms): " << final_metrics.latency_p50_ms << "\n";
    std::cout << "Latency P99 (ms): " << final_metrics.latency_p99_ms << "\n";
    
    return 0;
}
```

We deliberately avoid heavy CLI parsing libraries (like `boost::program_options`) to keep dependencies minimal and compilation fast. The core arguments—target, rate, and duration—are parsed in a simple loop. 

### Chapter 101: Configuration

The `Config` struct is the DNA of a load test. It dictates how the engine behaves on a macroscopic level.

```cpp
#pragma once
#include <string>
#include <map>

namespace loadforge {

struct Config {
    std::string test_id;
    std::string target_url;
    std::string method = "GET";
    std::map<std::string, std::string> headers;
    std::string body;
    double requests_per_second = 0;  // 0 = unlimited, meaning maximum throughput
    int concurrency = 10;            // Number of worker threads
    int duration_seconds = 10;
    int ramp_up_seconds = 0;
    int ramp_down_seconds = 0;
    int timeout_ms = 5000;
    bool keep_alive = true;
    int max_connections = 100;
};

} // namespace loadforge
```

- **`requests_per_second`**: The target throughput. If set to 0, the engine shifts into an "uncoordinated" mode, firing requests continuously without pacing. This is useful for finding the absolute upper limits of a server, but less useful for measuring realistic latency at a specific load.
- **`concurrency`**: The number of pre-spawned worker threads. This directly maps to CPU utilization on the load generator side.
- **`keep_alive`**: Determines TCP connection reuse. Disabling this simulates aggressive churn, forcing the target server to constantly handle TCP handshakes and teardowns (TIME_WAIT states).
- **`max_connections`**: Caps the connection pool size, preventing the load generator from exhausting ephemeral ports or file descriptors.

### Chapter 102-103: TCP Socket Connection

To generate massive load, we must talk directly to the network. Abstractions like `libcurl` are too heavy, introduce their own thread pools, and abstract away metrics we desperately need (like exact DNS resolution time and TTFB). We need raw POSIX sockets for maximum control.

Here is the complete `Socket::connect` implementation, which encapsulates advanced socket initialization:

```cpp
bool Socket::connect(const std::string& host, int port, int timeout_ms) {
    struct addrinfo hints{}, *res;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    
    // DNS Resolution
    if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &res) != 0) return false;
    
    fd_ = ::socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (fd_ < 0) {
        freeaddrinfo(res);
        return false;
    }
    
    int opt = 1;
    // Allow immediate reuse of local addresses
    setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    // Disable Nagle's Algorithm
    setsockopt(fd_, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
    
    // Set socket to non-blocking
    int flags = fcntl(fd_, F_GETFL, 0);
    fcntl(fd_, F_SETFL, flags | O_NONBLOCK);
    
    // Initiate non-blocking connection
    int rc = ::connect(fd_, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);
    
    if (rc < 0 && errno != EINPROGRESS) {
        close();
        return false;
    }
    
    // Immediate success (e.g., connecting to localhost)
    if (rc == 0) {
        fcntl(fd_, F_SETFL, flags); // Restore blocking mode if needed by consumer
        connected_ = true;
        return true;
    }
    
    // Connection is in progress. Wait using poll()
    struct pollfd pfd;
    pfd.fd = fd_;
    pfd.events = POLLOUT; // We wait for socket to become writable
    
    if (poll(&pfd, 1, timeout_ms) > 0) {
        int so_error;
        socklen_t len = sizeof(so_error);
        getsockopt(fd_, SOL_SOCKET, SO_ERROR, &so_error, &len);
        if (so_error == 0) { // No socket error occurred during connect
            fcntl(fd_, F_SETFL, flags);
            connected_ = true;
            return true;
        }
    }
    
    close();
    return false;
}
```

**Deep Dive:**
1. **`getaddrinfo`**: Translates human-readable domain names into IP addresses. It handles both IPv4 (`AF_INET`) and IPv6 (`AF_INET6`).
2. **`TCP_NODELAY`**: By default, Linux employs Nagle's algorithm, which buffers small outgoing packets to send them as a single larger frame, reducing network congestion. In a load tester, we want to blast our HTTP requests instantly without waiting. We must disable Nagle.
3. **Non-blocking `connect()`**: Calling a standard blocking `connect()` might cause our worker thread to hang indefinitely if the network drops SYN packets. By applying `fcntl(..., O_NONBLOCK)`, the `connect` call returns immediately with `EINPROGRESS`. We then use `poll()` to wait until the file descriptor becomes writable (`POLLOUT`), governed strictly by our `timeout_ms`. If `poll` times out, we close the socket and abort, protecting the thread from hanging.

### Chapter 104-105: Sending HTTP Request and Receiving Response

An HTTP request is merely a highly formatted ASCII text string sent over a TCP stream.

The `HttpClient::execute` function oversees the entire lifecycle of a request, from writing bytes to the wire to accumulating the response.

```cpp
RequestResult HttpClient::execute(Socket& socket, const HttpRequest& request, int timeout_ms) {
    RequestResult result;
    auto t0 = std::chrono::steady_clock::now();
    
    // 1. Connection Phase
    if (!socket.is_connected()) {
        if (!socket.connect(request.host, request.port, timeout_ms)) {
            result.error_type = "connect_timeout";
            return result;
        }
    }
    auto t1 = std::chrono::steady_clock::now();
    result.connect_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();
    
    // 2. Serialization and Sending
    std::string raw_req = request.serialize();
    ssize_t sent = socket.send(raw_req.c_str(), raw_req.size());
    if (sent < 0) {
        result.error_type = "send_error";
        return result;
    }
    result.bytes_sent = sent;
    
    auto t2 = std::chrono::steady_clock::now();
    result.send_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1).count();
    
    // 3. Receiving Phase
    std::string response_buffer;
    char buf[4096];
    bool first_byte = false;
    
    while (true) {
        ssize_t r = socket.recv(buf, sizeof(buf), timeout_ms);
        if (r < 0) {
            result.error_type = "read_timeout";
            return result;
        } else if (r == 0) {
            break; // Connection closed gracefully by peer
        }
        
        if (!first_byte) {
            auto t3 = std::chrono::steady_clock::now();
            result.ttfb_us = std::chrono::duration_cast<std::chrono::microseconds>(t3 - t2).count();
            first_byte = true;
        }
        
        response_buffer.append(buf, r);
        if (HttpParser::is_complete(response_buffer)) {
            break;
        }
    }
    
    auto t4 = std::chrono::steady_clock::now();
    result.download_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t2).count() - result.ttfb_us;
    result.total_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t0).count();
    
    result.bytes_received = response_buffer.size();
    result.response = HttpParser::parse(response_buffer);
    result.success = (result.response.status_code > 0);
    
    return result;
}
```

The wire format generated by `request.serialize()` guarantees every line ends with `\r\n` (CRLF), separating headers and the body with an empty line.

### Chapter 106: Response Parsing

Receiving data over TCP is challenging because TCP is a stream, not a message protocol. A single `recv()` call might yield half a header, a full header, or the header plus part of the body. The `HttpParser::parse` function must carefully slice the accumulated buffer.

```cpp
HttpResponse HttpParser::parse(const std::string& raw_response) {
    HttpResponse res;
    res.total_bytes = raw_response.size();
    
    size_t header_end = raw_response.find("\r\n\r\n");
    if (header_end == std::string::npos) return res; // Incomplete
    
    res.header_bytes = header_end + 4;
    std::string headers_str = raw_response.substr(0, header_end);
    res.body = raw_response.substr(header_end + 4);
    res.body_bytes = res.body.size();
    
    std::istringstream iss(headers_str);
    std::string line;
    
    // Parse Status Line
    if (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        size_t space1 = line.find(' ');
        size_t space2 = line.find(' ', space1 + 1);
        if (space1 != std::string::npos && space2 != std::string::npos) {
            res.status_code = std::stoi(line.substr(space1 + 1, space2 - space1 - 1));
            res.status_text = line.substr(space2 + 1);
        }
    }
    
    // Parse Headers
    while (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        size_t colon = line.find(':');
        if (colon != std::string::npos) {
            std::string key = line.substr(0, colon);
            std::string val = line.substr(colon + 1);
            val.erase(0, val.find_first_not_of(" \t")); // Trim leading whitespace
            std::transform(key.begin(), key.end(), key.begin(), ::tolower); // Case insensitive
            res.headers[key] = val;
            
            if (key == "connection" && val == "keep-alive") {
                res.keep_alive = true;
            }
        }
    }
    
    return res;
}
```

The `is_complete` helper checks the `Content-Length` header or the `Transfer-Encoding: chunked` termination sequence (`0\r\n\r\n`) to signal the `HttpClient` loop to break early without waiting for a socket close.

### Chapter 107: Measuring Request Latency

Latency in systems programming must be measured using a monotonic clock. `std::chrono::steady_clock` is crucial. Unlike `system_clock`, `steady_clock` is insulated from NTP (Network Time Protocol) adjustments. If an NTP sync adjusts the system time backwards by 2 seconds while a request is in flight, `system_clock` would yield a negative latency. `steady_clock` guarantees monotonic advancement.

Our measurements extract deep insight:
- **`connect_time`**: DNS resolution + TCP Handshake.
- **`send_time`**: Kernel buffer transfer.
- **`ttfb` (Time To First Byte)**: The true server processing time.
- **`download_time`**: The time taken to receive the body. High download times indicate network congestion or large payloads.

### Chapter 108-109: Error Handling and Timeouts

Robust systems expect failure. Timeouts are fundamentally enforced by the `poll()` call inside `Socket::connect` and `Socket::recv`. When the timeout elapses, `poll` returns 0. The engine classifies errors strictly:
- `connect_timeout`: Indicates network blackholing or overwhelmed firewalls.
- `read_timeout`: Target server accepted the connection but is deadlocked processing the request.
- `send_error`: Typically caused by receiving an RST packet (connection reset by peer).

These discrete error types are aggregated into the metrics snapshot so operators can diagnose the exact failure mode of their infrastructure.

### Chapter 110: First Benchmark

When running the engine, the output reveals the system's performance limits.
```
LoadForge v0.1.0
Target: http://localhost:8080/api/health
Duration: 5s
Total Requests: 300
Successful: 300
Failed: 0
Latency P50 (ms): 1.2
Latency P99 (ms): 34.5
```
A P99 of 34.5ms means that 1% of the 300 requests took 34.5 milliseconds or longer, highlighting tail latency anomalies not visible in the median.

---

## PART V — CONCURRENCY (Chapters 111-124)

### Chapter 111: Why One Request at a Time Is Insufficient

A sequential loop sending one request, waiting for the response, and repeating is fatally flawed for load generation.
If a server has an average latency of 50ms, a single sequential thread can achieve a maximum theoretical limit of 20 Requests Per Second (1000ms / 50ms). 

To achieve 1,000 RPS against a 50ms latency target, Little's Law ($L = \lambda W$) dictates we need an average of 50 concurrent connections continuously in flight ($50 = 1000 \times 0.050$). Concurrency is mandatory.

### Chapter 112-113: OS Threads Overhead

We could dynamically spawn a new `std::thread` for every outgoing request. However, kernel thread creation is expensive (~50-100μs latency overhead per thread) and consumes substantial virtual memory (usually ~2MB stack size per thread by default on Linux). Spawning 10,000 threads for 10,000 concurrent requests will exhaust the process's virtual memory limits and thrash the OS kernel scheduler with context switches.

### Chapter 114: Thread Pool Deep Dive

The solution is the Thread Pool pattern: a fixed number of pre-allocated threads waiting in a dormant state for work. 

Here is the complete implementation of the LoadForge `ThreadPool`:

**Header (`include/loadforge/thread_pool.h`)**:
```cpp
#pragma once
#include <vector>
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <future>
#include <type_traits>

namespace loadforge {

class ThreadPool {
public:
    explicit ThreadPool(size_t num_threads);
    ~ThreadPool();
    
    template<class F, class... Args>
    auto submit(F&& f, Args&&... args) -> std::future<typename std::invoke_result<F, Args...>::type> {
        using return_type = typename std::invoke_result<F, Args...>::type;
        
        // Wrap the function and its arguments into a packaged_task
        auto task = std::make_shared<std::packaged_task<return_type()>>(
            std::bind(std::forward<F>(f), std::forward<Args>(args)...)
        );
        
        // Extract the future before pushing the task
        std::future<return_type> res = task->get_future();
        {
            std::unique_lock<std::mutex> lock(mutex_);
            if (stop_) throw std::runtime_error("enqueue on stopped ThreadPool");
            // Wrap the packaged_task in a generic void function
            tasks_.emplace([task]() { (*task)(); });
        }
        cv_.notify_one();
        return res;
    }
    
    void shutdown();
    size_t queue_depth() const;
    
private:
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    bool stop_ = false;
};

} // namespace loadforge
```

**Implementation (`src/thread_pool.cpp`)**:
```cpp
#include "loadforge/thread_pool.h"

namespace loadforge {

ThreadPool::ThreadPool(size_t num_threads) {
    for (size_t i = 0; i < num_threads; ++i) {
        workers_.emplace_back([this] {
            while (true) {
                std::function<void()> task;
                {
                    std::unique_lock<std::mutex> lock(mutex_);
                    // Thread blocks here until notified AND condition is met
                    cv_.wait(lock, [this] { return stop_ || !tasks_.empty(); });
                    if (stop_ && tasks_.empty()) return;
                    
                    task = std::move(tasks_.front());
                    tasks_.pop();
                }
                // Execute task outside the lock
                task();
            }
        });
    }
}

ThreadPool::~ThreadPool() {
    shutdown();
}

void ThreadPool::shutdown() {
    {
        std::unique_lock<std::mutex> lock(mutex_);
        if (stop_) return;
        stop_ = true;
    }
    cv_.notify_all(); // Wake up all waiting workers
    for (std::thread& worker : workers_) {
        if (worker.joinable()) worker.join();
    }
}

size_t ThreadPool::queue_depth() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tasks_.size();
}

} // namespace loadforge
```

**How `submit()` Works Internally:**
1. **Templates and Type Traits**: The `submit` method takes a callable `F` and variadic arguments `Args...`. It uses `std::invoke_result` to deduce the return type of the callable at compile time.
2. **`std::packaged_task`**: This is a wrapper that links a callable to a `std::future`. When the task executes, its return value (or exception) is automatically stored in the shared state accessed by the `future`.
3. **`std::bind`**: Binds the function `f` with its arguments `args`, creating a nullary (zero-argument) function suitable for the packaged task.
4. **`std::shared_ptr`**: The packaged task is moved into a `shared_ptr` because `std::function` requires copyable objects, but `std::packaged_task` is move-only.
5. **Type Erasure**: The task queue stores generic `std::function<void()>`. We wrap our shared task pointer in a lambda `[task]() { (*task)(); }` which returns void, erasing the underlying return type so it fits in the unified queue.
6. **`std::condition_variable`**: When `submit` calls `cv_.notify_one()`, the kernel wakes exactly one sleeping worker thread to pull the task from the queue.

### Chapter 115-118: Shared State, Mutexes, and Atomics

When multiple threads concurrently process requests and mutate the central `MetricsCollector`, we encounter race conditions.
Wrapping every counter increment in a `std::mutex` would cause catastrophic lock contention. The worker threads would spend more time waiting for the lock than communicating over the network, completely bottlenecking the engine.

Instead, we use `std::atomic<uint64_t>`:
```cpp
total_requests_.fetch_add(1, std::memory_order_relaxed);
```
Atomics compile down to specialized hardware instructions like `LOCK XADD` on x86 processors. Because we only need the counter increments to be atomic—and do not need them to synchronize surrounding memory operations—we use `std::memory_order_relaxed`. This prevents the compiler and CPU from emitting expensive memory barriers, saving precious nanoseconds per request.

### Chapter 119-124: Queue Depth and Backpressure

The thread pool's `queue_depth()` is a critical health metric. If the target server slows down, the worker threads become blocked in `socket.recv()` waiting for responses. The engine continues to push tasks via `submit()`. Because workers are occupied, the tasks accumulate in the queue. 

This phenomenon is known as backpressure. If the generator operates faster than the workers can clear the queue, memory usage will spike indefinitely until an Out-Of-Memory (OOM) kill occurs. Monitoring queue depth allows operators to detect when the generator itself is the bottleneck.

---

## PART VI — HIGH-PERFORMANCE NETWORKING (Chapters 125-143)

### Chapter 125-126: Non-Blocking Sockets

Blocking sockets tie one thread to one connection. 10,000 connections require 10,000 threads. This architectural limit is famous as the C10K problem. 

By utilizing non-blocking sockets via `fcntl(fd, F_SETFL, O_NONBLOCK)`, a socket operation returns `EAGAIN` or `EWOULDBLOCK` instantly if no data is available, freeing the thread to perform other tasks.

### Chapter 127-135: select, poll, and epoll

To know when a non-blocking socket is actually ready for reading or writing without busy-waiting (spinning in a CPU loop), operating systems provide I/O multiplexing:
- **`select()`**: The legacy approach. Uses a bitmask (`fd_set`) which is hardcoded to a maximum of 1024 file descriptors. Unusable for modern load testing.
- **`epoll()`**: Linux-specific. Uses an event-driven kernel data structure yielding O(1) performance regardless of connection count. 
- **`poll()`**: POSIX standard, taking an array of `pollfd` structs. It doesn't have the 1024 limit of `select`.

For simplicity and cross-platform compatibility (macOS/Linux), LoadForge uses `poll()` tightly scoped within the `Socket` class methods to implement millisecond-accurate timeouts on blocking-like operations.

### Chapter 136-139: Connection Manager and Connection Pool

Establishing a TCP connection requires a 3-way handshake (SYN, SYN-ACK, ACK), which inherently costs 1 full Round Trip Time (RTT). If HTTPS is used, TLS negotiation adds further handshakes. 
To generate immense load effectively, we must reuse connections via HTTP Keep-Alive.

Here is the complete `ConnectionPool` implementation:

```cpp
#include "loadforge/connection_pool.h"

namespace loadforge {

ConnectionPool::ConnectionPool(const std::string& host, int port, int max_connections)
    : host_(host), port_(port), max_connections_(max_connections) {}

ConnectionPool::~ConnectionPool() {
    while (!idle_.empty()) {
        idle_.pop(); // Socket destructor calls close()
    }
}

Socket ConnectionPool::acquire(int timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    // Wait until there's an idle socket OR we haven't hit the active limit
    cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms), [this] {
        return !idle_.empty() || active_ < max_connections_;
    });
    
    if (!idle_.empty()) {
        Socket s = std::move(idle_.front());
        idle_.pop();
        active_++;
        return s;
    }
    
    if (active_ < max_connections_) {
        active_++;
        lock.unlock(); // Release lock before connecting!
        
        Socket s;
        s.connect(host_, port_, timeout_ms);
        return s;
    }
    
    return Socket(); // Return empty (unconnected) socket on timeout
}

void ConnectionPool::release(Socket socket) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (socket.is_connected()) {
        idle_.push(std::move(socket));
    }
    active_--;
    cv_.notify_one();
}

void ConnectionPool::discard(Socket socket) {
    std::lock_guard<std::mutex> lock(mutex_);
    socket.close();
    active_--;
    cv_.notify_one(); // A slot freed up, notify waiting threads
}

int ConnectionPool::active_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return active_;
}

} // namespace loadforge
```

**Flow:**
1. **Acquire**: Tries to pop an idle connection. If none exist but we are below `max_connections`, it creates a new one. The lock is crucially dropped *before* calling `connect()` so other threads aren't blocked during DNS resolution.
2. **Release**: The worker returns the socket to the pool.
3. **Discard**: If the server responds with `Connection: close` or an error occurs, the socket is discarded, decrementing `active_` and making room for new connections.

### Chapter 140-143: Timing and Benchmarking

High-performance C++ relies heavily on stack allocations to bypass the memory allocator entirely. In `HttpClient::execute`, the 4096-byte `buf` is allocated on the stack. The `HttpRequest` and `HttpResponse` objects are kept small. Using `std::string` can incur heap allocations, so they are kept isolated to the serialization phase.

---

## PART VII — LOAD GENERATION ENGINE (Chapters 144-157)

### Chapter 144: LoadEngine Architecture

The `LoadEngine` binds all components together. Let's examine the complete `engine.cpp` logic.

```cpp
#include "loadforge/engine.h"
#include "loadforge/url_parser.h"

namespace loadforge {

LoadEngine::LoadEngine(const Config& config) : config_(config) {
    UrlComponents url = UrlParser::parse(config_.target_url);
    host_ = url.host;
    port_ = url.port;
    path_ = url.path + (url.query.empty() ? "" : "?" + url.query);
    
    pool_ = std::make_unique<ConnectionPool>(host_, port_, config_.max_connections);
    thread_pool_ = std::make_unique<ThreadPool>(config_.concurrency);
    limiter_ = std::make_unique<RateLimiter>(config_.requests_per_second);
    metrics_ = std::make_unique<MetricsCollector>("local", config_.test_id);
}

LoadEngine::~LoadEngine() { stop(); }

MetricsSnapshot LoadEngine::run() {
    running_ = true;
    stop_requested_ = false;
    
    // Spawn the asynchronous metrics reporter thread
    std::thread reporter(&LoadEngine::metrics_reporter_loop, this);
    
    auto start_time = std::chrono::steady_clock::now();
    
    while (!stop_requested_) {
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(now - start_time).count();
        
        if (config_.duration_seconds > 0 && elapsed >= config_.duration_seconds) {
            break;
        }
        
        // Dynamically adjust rate for ramp-up patterns
        double current_rate = calculate_current_rate(elapsed);
        limiter_->set_rate(current_rate);
        
        // Blocking call: governs exact throughput
        limiter_->acquire();
        if (stop_requested_) break;
        
        // Push the work to the thread pool
        thread_pool_->submit([this] {
            execute_request();
        });
    }
    
    // Graceful teardown
    thread_pool_->shutdown();
    running_ = false;
    
    if (reporter.joinable()) reporter.join();
    
    return metrics_->final_snapshot();
}

void LoadEngine::execute_request() {
    Socket sock = pool_->acquire(config_.timeout_ms);
    if (!sock.is_connected()) {
        RequestResult err;
        err.success = false;
        err.error_type = "pool_timeout";
        metrics_->record_request(err);
        return;
    }
    
    HttpRequest req;
    req.method = config_.method;
    req.host = host_;
    req.port = port_;
    req.path = path_;
    req.headers = config_.headers;
    req.body = config_.body;
    if (config_.keep_alive) req.headers["Connection"] = "keep-alive";
    
    HttpClient client;
    RequestResult result = client.execute(sock, req, config_.timeout_ms);
    
    metrics_->record_request(result);
    
    if (config_.keep_alive && result.response.keep_alive && result.success) {
        pool_->release(std::move(sock));
    } else {
        pool_->discard(std::move(sock));
    }
}
```

The `run()` loop is the beating heart. It determines if it's time to send a request (via the `RateLimiter`), schedules the request on the `ThreadPool`, and immediately loops back. 

### Chapter 146-148: Rate Limiter and Token Bucket Math

To enforce precise Requests Per Second (RPS), we use the Token Bucket algorithm. 

Mathematically:
Tokens are generated at rate $R$ (tokens per second). The bucket holds a maximum of $B$ tokens. 
To send a request, we consume 1 token.
If the bucket is empty, we must wait for time $t = \frac{1 - \text{current\_tokens}}{R}$.

Complete `rate_limiter.cpp`:
```cpp
#include "loadforge/rate_limiter.h"

namespace loadforge {

RateLimiter::RateLimiter(double rate_per_second) 
    : rate_(rate_per_second), tokens_(rate_per_second), max_tokens_(rate_per_second), 
      last_refill_(std::chrono::steady_clock::now()) {}

void RateLimiter::refill() {
    if (rate_ <= 0) return;
    auto now = std::chrono::steady_clock::now();
    double elapsed = std::chrono::duration<double>(now - last_refill_).count();
    
    tokens_ += elapsed * rate_; // Add proportional tokens
    if (tokens_ > max_tokens_) tokens_ = max_tokens_; // Cap at max
    last_refill_ = now;
}

void RateLimiter::acquire() {
    if (rate_ <= 0) return; // Unlimited throughput
    std::unique_lock<std::mutex> lock(mutex_);
    while (true) {
        refill();
        if (tokens_ >= 1.0) {
            tokens_ -= 1.0;
            return;
        }
        // Calculate precise microsecond wait duration
        double wait_seconds = (1.0 - tokens_) / rate_;
        auto wait_duration = std::chrono::microseconds(
            static_cast<int64_t>(wait_seconds * 1000000.0));
            
        // Condition variable sleeps the thread efficiently
        cv_.wait_for(lock, wait_duration);
    }
}
```
This guarantees an exceptionally smooth traffic profile without aggressive bursting.

---

## PART VIII — METRICS (Chapters 158-177)

### Chapter 158: Why Metrics Matter
Blindly firing TCP packets is a denial-of-service attack, not a load test. A load test only provides value through its telemetry. Throughput, precise latency percentiles, error rates, and system saturation indicators distinguish an engineering tool from a toy script.

### Chapter 174-175: Histogram Deep Dive

Tracking latency for millions of requests cannot be done by storing every single float (which would exhaust memory) or by summing them (which destroys percentile data). We employ a High-Dynamic-Range (HDR) logarithmic histogram.

```cpp
#include "loadforge/histogram.h"
#include <cmath>

namespace loadforge {

Histogram::Histogram() : min_(1e9), max_(0), sum_(0), count_(0) {
    for (int i = 0; i < NUM_BUCKETS; ++i) buckets_[i] = 0;
}

int Histogram::bucket_for(double value) const {
    if (value <= 1.0) return 0;
    // Logarithmic bucket assignment: Base 1.1 provides dense buckets
    // for small values, and sparse buckets for large values
    int b = static_cast<int>(std::log(value) / std::log(1.1));
    if (b < 0) b = 0;
    if (b >= NUM_BUCKETS) b = NUM_BUCKETS - 1;
    return b;
}

double Histogram::value_for(int bucket) const {
    if (bucket <= 0) return 1.0;
    return std::pow(1.1, bucket);
}

void Histogram::record(double value) {
    if (value < 0) return;
    int b = bucket_for(value);
    
    // Atomic, lock-free increment of the specific bucket
    buckets_[b].fetch_add(1, std::memory_order_relaxed);
    
    // Lock-free min/max updates using Compare-And-Swap (CAS)
    double current_min = min_.load(std::memory_order_relaxed);
    while (value < current_min && !min_.compare_exchange_weak(current_min, value, std::memory_order_relaxed)) {}
    
    double current_max = max_.load(std::memory_order_relaxed);
    while (value > current_max && !max_.compare_exchange_weak(current_max, value, std::memory_order_relaxed)) {}
    
    double current_sum = sum_.load(std::memory_order_relaxed);
    while (!sum_.compare_exchange_weak(current_sum, current_sum + value, std::memory_order_relaxed)) {}
    
    count_.fetch_add(1, std::memory_order_relaxed);
}

double Histogram::percentile(double p) const {
    uint64_t total = count_.load(std::memory_order_relaxed);
    if (total == 0) return 0.0;
    
    uint64_t target = static_cast<uint64_t>(total * (p / 100.0));
    uint64_t acc = 0;
    
    // Iterate through buckets until we reach the target population
    for (int i = 0; i < NUM_BUCKETS; ++i) {
        acc += buckets_[i].load(std::memory_order_relaxed);
        if (acc >= target) {
            return value_for(i);
        }
    }
    return max_.load(std::memory_order_relaxed);
}

} // namespace loadforge
```
With `NUM_BUCKETS` set around 200, we cover latencies from 1 millisecond up to 60 seconds with exceptional memory efficiency and lock-free concurrency.

### Chapter 177: Coordinated Omission

A critical design flaw in legacy load testers (like Apache Bench) is Coordinated Omission. 
Coordinated Omission occurs when the load generator waits for a slow response before sending the next one, thereby artificially throttling its own throughput. Gil Tene famously highlighted this: if a server stalls for 500ms, the load generator sends fewer requests during that stall. As a result, the hundreds of requests that *should* have experienced terrible queueing delay are never sent, and never measured.

LoadForge eradicates Coordinated Omission architecturally. 
Look back at the `LoadEngine::run` loop. The **scheduling** (handled by the RateLimiter) operates entirely independently from the **execution** (handled by the worker thread pool). If the target server stalls, the main loop continues iterating, generating tokens, and dumping tasks into the `ThreadPool` queue at the requested RPS. When the workers eventually recover, they measure the latency of those delayed tasks correctly—reflecting the massive spike in queueing delay. 

*End of Part IV-VIII Expanded Edition.*
