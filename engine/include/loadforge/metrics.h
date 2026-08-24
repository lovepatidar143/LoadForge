#pragma once
#include "histogram.h"
#include "http_client.h"
#include <string>
#include <map>
#include <mutex>
#include <atomic>
#include <chrono>

namespace loadforge {

struct MetricsSnapshot {
    std::string worker_id;
    std::string test_id;
    int64_t timestamp_ms;
    
    uint64_t total_requests;
    uint64_t successful_requests;
    uint64_t failed_requests;
    uint64_t bytes_sent;
    uint64_t bytes_received;
    
    double current_rps;
    int32_t active_connections;
    int32_t queue_depth;
    
    std::map<int, uint64_t> status_codes;
    std::map<std::string, uint64_t> errors;
    
    double latency_min_ms;
    double latency_max_ms;
    double latency_mean_ms;
    double latency_p50_ms;
    double latency_p90_ms;
    double latency_p95_ms;
    double latency_p99_ms;
    double latency_p999_ms;
    
    double worker_cpu_percent;
    double worker_memory_mb;
    
    Histogram::BucketData latency_buckets;
};

class MetricsCollector {
public:
    MetricsCollector(const std::string& worker_id, const std::string& test_id);
    
    void record_request(const RequestResult& result);
    
    MetricsSnapshot snapshot();
    MetricsSnapshot final_snapshot();
    
    void set_active_connections(int count);
    void set_queue_depth(int depth);
    
private:
    std::string worker_id_;
    std::string test_id_;
    
    std::atomic<uint64_t> total_requests_{0};
    std::atomic<uint64_t> successful_requests_{0};
    std::atomic<uint64_t> failed_requests_{0};
    std::atomic<uint64_t> bytes_sent_{0};
    std::atomic<uint64_t> bytes_received_{0};
    
    std::atomic<uint64_t> interval_requests_{0};
    std::chrono::steady_clock::time_point interval_start_;
    
    Histogram latency_histogram_;
    Histogram interval_histogram_;
    
    std::mutex status_mutex_;
    std::map<int, uint64_t> status_codes_;
    std::map<std::string, uint64_t> errors_;
    
    std::atomic<int> active_connections_{0};
    std::atomic<int> queue_depth_{0};
    
    double get_cpu_percent();
    double get_memory_mb();
};

} // namespace loadforge
