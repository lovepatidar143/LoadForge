# LoadForge Interview Handbook: Massive Expansion

This handbook prepares you for elite systems engineering interviews by framing complex OS, networking, and C++ concepts around the LoadForge architecture.

## Section 1: C++ and Systems Programming

**Q1: What is RAII, and how does LoadForge use it to prevent resource leaks?**
**Answer:** RAII (Resource Acquisition Is Initialization) is a C++ paradigm where the lifecycle of a resource is strictly bound to the lifetime of an object. In LoadForge, network sockets are raw OS file descriptors (integers). If a thread crashes or returns early, that file descriptor stays open, leading to fd exhaustion. We encapsulate the `socket()` call inside the constructor of a `Socket` class, and put the `close(fd)` call inside the destructor. When the `Socket` object goes out of scope, the destructor is guaranteed to run, closing the socket safely.

**Q2: Explain move semantics. Why does the Socket class delete its copy constructor?**
**Answer:** A network socket (file descriptor) is a unique handle to an OS resource. You cannot "copy" a socket the way you copy an integer; copying the integer just gives you two variables pointing to the exact same OS resource, leading to double-close bugs. We delete the copy constructor (`Socket(const Socket&) = delete`). Instead, we use a move constructor (`Socket(Socket&& other)`), which copies the `fd` integer and then sets `other.fd = -1`. This safely transfers ownership, allowing sockets to be stored in `std::vector` or connection pools without duplication.

**Q3: How do atomic operations in the Latency Histogram avoid data races without locks?**
**Answer:** In a highly concurrent system, using `std::mutex` to protect the latency histogram would serialize all worker threads, completely bottlenecking throughput. Instead, the histogram uses an array of `std::atomic<uint64_t>` buckets. When a request finishes, the thread calculates the bucket index and uses `fetch_add(1)`. This compiles down to a lock-free hardware instruction (like `LOCK XADD` on x86), allowing threads to increment buckets concurrently without kernel-level blocking.

**Q4: What memory ordering does LoadForge use for its atomics, and why?**
**Answer:** We use `std::memory_order_relaxed`. Memory ordering dictates how atomic operations synchronize surrounding non-atomic memory accesses across threads. Because our histogram bucket increments are completely independent (we don't care if thread A's increment synchronizes memory state with thread B, we only care that the count itself is accurate), `relaxed` is sufficient. This avoids expensive memory barrier instructions, maximizing CPU throughput.

**Q5: What is a segmentation fault, and how might one occur in a custom HTTP parser?**
**Answer:** A segfault occurs when a program attempts to access a memory location it is not allowed to (e.g., reading past the end of an array or dereferencing a null pointer). In a custom C++ HTTP parser, reading a raw TCP buffer and searching for the `\r\n\r\n` header delimiter without correctly checking the buffer bounds will cause the pointer to read unmapped memory, crashing the worker process.

## Section 2: Operating Systems

**Q6: What is the difference between a process and a thread? Why does LoadForge use threads?**
**Answer:** A process is an isolated execution environment with its own virtual memory space, file descriptors, and security context. A thread is an execution context within a process; all threads in a process share the same heap memory. LoadForge uses threads because it allows all workers to seamlessly update the same global metrics (Token Bucket, Histogram) in memory without requiring complex and slow Inter-Process Communication (IPC) mechanisms like shared memory segments or pipes.

**Q7: Explain the concept of a context switch and its impact on performance.**
**Answer:** A context switch is the OS scheduler stopping one thread, saving its CPU registers to memory, loading another thread's registers, and resuming execution. This process flushes the CPU cache and takes microseconds. If LoadForge spawned 10,000 threads, the CPU would spend more time switching contexts than sending HTTP requests (scheduler thrashing). By using a thread pool sized to the physical CPU cores, we eliminate context switching; threads run continuously, multiplexing sockets using `poll()`.

**Q8: What is the C10k problem, and how do event loops solve it?**
**Answer:** The C10k problem is the historical challenge of a server handling 10,000 concurrent connections. Early servers spawned a thread per connection, leading to memory exhaustion and context switch thrashing. Event loops solve this using I/O multiplexing (`poll`, `epoll`, `kqueue`). A single thread can monitor thousands of non-blocking sockets. When the OS signals that a socket is ready to read/write, the thread processes it, then goes back to polling.

**Q9: Explain the Linux file descriptor limit (`ulimit -n`). How does it impact load testing?**
**Answer:** The Linux kernel strictly limits the number of file descriptors (sockets, files) a process can open (often defaulting to 1024). A load tester trying to open 5,000 concurrent connections will receive an "EMFILE: Too many open files" error from the `socket()` syscall. To fix this, you must tune the OS by increasing `fs.file-max` in `sysctl` and increasing the user limits via `ulimit -n`.

**Q10: What is user-space vs kernel-space?**
**Answer:** Kernel-space is the privileged area where the core OS code, hardware drivers, and network stack execute. User-space is where normal applications (like LoadForge) run. Making a system call (like `send()` or `recv()`) requires a context switch from user-space to kernel-space, which is slow. High-end systems bypass the kernel network stack entirely using DPDK (Data Plane Development Kit) to write packets directly to the NIC from user-space.

## Section 3: Networking and TCP/IP

**Q11: What is the TCP 3-way handshake? What is its latency cost?**
**Answer:** To establish a connection, TCP requires:
1. Client sends SYN.
2. Server replies with SYN-ACK.
3. Client replies with ACK.
This takes one full Round Trip Time (RTT). If a load tester opens a new connection for every HTTP request, the latency recorded will artificially include this RTT. This is why LoadForge uses Connection Pooling (Keep-Alive).

**Q12: What is TIME_WAIT in the TCP state machine?**
**Answer:** When a client actively closes a TCP connection, the socket enters the `TIME_WAIT` state for typically 60 seconds. This ensures any delayed packets in the network are discarded and don't interfere with a future connection reusing the same port. If a load tester doesn't use Keep-Alive and generates 10,000 requests per second, it will exhaust all 65,535 ephemeral ports in seconds, causing `bind()` errors.

**Q13: How does LoadForge mitigate ephemeral port exhaustion?**
**Answer:** 
1. **Connection Pooling:** Keeping sockets alive and reusing them for multiple HTTP requests.
2. **Kernel Tuning:** Enabling `net.ipv4.tcp_tw_reuse = 1` in `sysctl`, which allows the OS to aggressively reuse sockets in the `TIME_WAIT` state for new outbound connections.

**Q14: Describe the structure of an HTTP/1.1 request.**
**Answer:** It is a plaintext protocol.
- Request Line: `GET /api/users HTTP/1.1\r\n`
- Headers: `Host: target.com\r\nConnection: keep-alive\r\n`
- Blank Line: `\r\n` (Signals end of headers)
- Body: (Optional, length defined by `Content-Length` header).

**Q15: Why is parsing HTTP/1.1 in C++ difficult?**
**Answer:** Because TCP is a streaming protocol, not a message protocol. If you call `recv()`, you might receive half a header, or exactly the header, or the header and half the body. The C++ parser must buffer the stream, search for `\r\n\r\n` to delimit headers, parse the `Content-Length`, and then track exactly how many bytes of the body have been received before returning the socket to the pool.

## Section 4: Concurrency and Performance

**Q16: What is Coordinated Omission in load testing?**
**Answer:** Coordinated Omission occurs when a target server slows down, causing the load tester's threads to block while waiting for responses. Because the threads are blocked, they *fail to send* the requested number of requests per second. The latency numbers look deceptively good because the load tester "omitted" measuring the latency of the requests it failed to send. LoadForge mitigates this using a decoupled token bucket that tracks intended start times vs actual start times.

**Q17: Explain Amdahl's Law in the context of LoadForge.**
**Answer:** Amdahl's Law states that the theoretical speedup of a system is limited by its sequential (blocking) parts. If LoadForge used a single global Mutex to protect the connection pool, the time spent acquiring that lock would represent the sequential portion. No matter how many CPU cores or worker threads you add, the system throughput would plateau, choked by the mutex contention. Lock-free architectures are required to bypass Amdahl's limit.

**Q18: What is False Sharing in multi-threading?**
**Answer:** CPUs read memory in chunks called cache lines (typically 64 bytes). If Thread A updates an atomic counter and Thread B updates a different atomic counter, but both counters happen to live on the exact same 64-byte cache line in RAM, the CPU hardware will lock and invalidate the cache line for both threads. This destroys performance. To fix this, variables must be padded (e.g., `alignas(64)`) to ensure they reside on distinct cache lines.

*(Note: This handbook contains an extensive subset of questions designed to probe deep technical understanding. During a real interview, use the exact mechanisms built into LoadForge to prove practical experience.)*
