#pragma once
#include "socket.h"
#include <string>
#include <queue>
#include <mutex>
#include <condition_variable>

namespace loadforge {

class ConnectionPool {
public:
    ConnectionPool(const std::string& host, int port, int max_connections);
    ~ConnectionPool();
    
    Socket acquire(int timeout_ms = 5000);
    void release(Socket socket);
    void discard(Socket socket);
    
    int active_count() const;
    int idle_count() const;
    int total_count() const;
    
private:
    std::string host_;
    int port_;
    int max_connections_;
    std::queue<Socket> idle_;
    int active_ = 0;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
};

} // namespace loadforge
