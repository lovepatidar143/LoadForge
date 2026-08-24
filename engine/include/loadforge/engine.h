#pragma once
#include "config.h"
#include "connection_pool.h"
#include "thread_pool.h"
#include "rate_limiter.h"
#include "metrics.h"
#include <memory>
#include <functional>
#include <atomic>

namespace loadforge {

class LoadEngine {
public:
    explicit LoadEngine(const Config& config);
    ~LoadEngine();
    
    MetricsSnapshot run();
    void stop();
    bool is_running() const;
    MetricsSnapshot current_metrics();
    
    using MetricsCallback = std::function<void(const MetricsSnapshot&)>;
    void set_metrics_callback(MetricsCallback cb);
    
private:
    Config config_;
    std::unique_ptr<ConnectionPool> pool_;
    std::unique_ptr<ThreadPool> thread_pool_;
    std::unique_ptr<RateLimiter> limiter_;
    std::unique_ptr<MetricsCollector> metrics_;
    
    std::atomic<bool> running_{false};
    std::atomic<bool> stop_requested_{false};
    
    MetricsCallback metrics_callback_;
    
    std::string host_;
    int port_;
    std::string path_;
    
    void execute_request();
    void metrics_reporter_loop();
    double calculate_current_rate(double elapsed_seconds);
};

} // namespace loadforge
