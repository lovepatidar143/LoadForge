#include "loadforge/rate_limiter.h"

namespace loadforge {

RateLimiter::RateLimiter(double rate_per_second) 
    : rate_(rate_per_second), tokens_(rate_per_second), max_tokens_(rate_per_second), 
      last_refill_(std::chrono::steady_clock::now()) {}

void RateLimiter::refill() {
    if (rate_ <= 0) return;
    auto now = std::chrono::steady_clock::now();
    double elapsed = std::chrono::duration<double>(now - last_refill_).count();
    tokens_ += elapsed * rate_;
    if (tokens_ > max_tokens_) tokens_ = max_tokens_;
    last_refill_ = now;
}

void RateLimiter::acquire() {
    if (rate_ <= 0) return;
    std::unique_lock<std::mutex> lock(mutex_);
    while (true) {
        refill();
        if (tokens_ >= 1.0) {
            tokens_ -= 1.0;
            return;
        }
        // Calculate how long we need to wait for one token
        double wait_seconds = (1.0 - tokens_) / rate_;
        auto wait_duration = std::chrono::microseconds(
            static_cast<int64_t>(wait_seconds * 1000000.0));
        // Wait for that duration, then recheck
        cv_.wait_for(lock, wait_duration);
    }
}

bool RateLimiter::try_acquire() {
    if (rate_ <= 0) return true;
    std::lock_guard<std::mutex> lock(mutex_);
    refill();
    if (tokens_ >= 1.0) {
        tokens_ -= 1.0;
        return true;
    }
    return false;
}

void RateLimiter::set_rate(double rate_per_second) {
    std::lock_guard<std::mutex> lock(mutex_);
    rate_ = rate_per_second;
    max_tokens_ = rate_per_second;
}

double RateLimiter::current_rate() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return rate_;
}

} // namespace loadforge
