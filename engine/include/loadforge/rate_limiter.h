#pragma once
#include <chrono>
#include <mutex>
#include <condition_variable>

namespace loadforge {

class RateLimiter {
public:
    explicit RateLimiter(double rate_per_second);
    
    void acquire();
    bool try_acquire();
    void set_rate(double rate_per_second);
    double current_rate() const;
    
private:
    double rate_;
    double tokens_;
    double max_tokens_;
    std::chrono::steady_clock::time_point last_refill_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    
    void refill();
};

} // namespace loadforge
