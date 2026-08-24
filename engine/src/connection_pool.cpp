#include "loadforge/connection_pool.h"

namespace loadforge {

ConnectionPool::ConnectionPool(const std::string& host, int port, int max_connections)
    : host_(host), port_(port), max_connections_(max_connections) {}

ConnectionPool::~ConnectionPool() {
    while (!idle_.empty()) {
        idle_.pop();
    }
}

Socket ConnectionPool::acquire(int timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
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
        lock.unlock();
        Socket s;
        s.connect(host_, port_, timeout_ms);
        return s;
    }
    
    return Socket(); // Return empty socket if timeout
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
    cv_.notify_one();
}

int ConnectionPool::active_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return active_;
}

int ConnectionPool::idle_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return idle_.size();
}

int ConnectionPool::total_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return active_ + idle_.size();
}

} // namespace loadforge
