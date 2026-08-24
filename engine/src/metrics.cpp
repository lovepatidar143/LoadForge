#include "loadforge/metrics.h"
#include <sys/resource.h>

namespace loadforge {

MetricsCollector::MetricsCollector(const std::string& worker_id, const std::string& test_id)
    : worker_id_(worker_id), test_id_(test_id), interval_start_(std::chrono::steady_clock::now()) {}

void MetricsCollector::record_request(const RequestResult& result) {
    total_requests_++;
    interval_requests_++;
    bytes_sent_ += result.bytes_sent;
    bytes_received_ += result.bytes_received;
    
    if (result.success) {
        successful_requests_++;
        latency_histogram_.record(result.total_time_us / 1000.0);
        interval_histogram_.record(result.total_time_us / 1000.0);
        
        std::lock_guard<std::mutex> lock(status_mutex_);
        status_codes_[result.response.status_code]++;
    } else {
        failed_requests_++;
        std::lock_guard<std::mutex> lock(status_mutex_);
        errors_[result.error_type]++;
    }
}

MetricsSnapshot MetricsCollector::snapshot() {
    auto now = std::chrono::steady_clock::now();
    double elapsed_s = std::chrono::duration<double>(now - interval_start_).count();
    
    MetricsSnapshot s;
    s.worker_id = worker_id_;
    s.test_id = test_id_;
    s.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
        
    s.total_requests = total_requests_.load();
    s.successful_requests = successful_requests_.load();
    s.failed_requests = failed_requests_.load();
    s.bytes_sent = bytes_sent_.load();
    s.bytes_received = bytes_received_.load();
    
    uint64_t reqs = interval_requests_.exchange(0);
    s.current_rps = elapsed_s > 0 ? reqs / elapsed_s : 0;
    
    s.active_connections = active_connections_.load();
    s.queue_depth = queue_depth_.load();
    
    {
        std::lock_guard<std::mutex> lock(status_mutex_);
        s.status_codes = status_codes_;
        s.errors = errors_;
    }
    
    s.latency_min_ms = interval_histogram_.min();
    s.latency_max_ms = interval_histogram_.max();
    s.latency_mean_ms = interval_histogram_.mean();
    s.latency_p50_ms = interval_histogram_.p50();
    s.latency_p90_ms = interval_histogram_.p90();
    s.latency_p95_ms = interval_histogram_.p95();
    s.latency_p99_ms = interval_histogram_.p99();
    s.latency_p999_ms = interval_histogram_.p999();
    
    s.latency_buckets = interval_histogram_.get_buckets();
    
    interval_histogram_.reset();
    interval_start_ = now;
    
    s.worker_cpu_percent = get_cpu_percent();
    s.worker_memory_mb = get_memory_mb();
    
    return s;
}

MetricsSnapshot MetricsCollector::final_snapshot() {
    MetricsSnapshot s;
    s.worker_id = worker_id_;
    s.test_id = test_id_;
    s.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
        
    s.total_requests = total_requests_.load();
    s.successful_requests = successful_requests_.load();
    s.failed_requests = failed_requests_.load();
    s.bytes_sent = bytes_sent_.load();
    s.bytes_received = bytes_received_.load();
    
    s.active_connections = active_connections_.load();
    s.queue_depth = queue_depth_.load();
    
    {
        std::lock_guard<std::mutex> lock(status_mutex_);
        s.status_codes = status_codes_;
        s.errors = errors_;
    }
    
    s.latency_min_ms = latency_histogram_.min();
    s.latency_max_ms = latency_histogram_.max();
    s.latency_mean_ms = latency_histogram_.mean();
    s.latency_p50_ms = latency_histogram_.p50();
    s.latency_p90_ms = latency_histogram_.p90();
    s.latency_p95_ms = latency_histogram_.p95();
    s.latency_p99_ms = latency_histogram_.p99();
    s.latency_p999_ms = latency_histogram_.p999();
    
    s.latency_buckets = latency_histogram_.get_buckets();
    
    s.worker_cpu_percent = get_cpu_percent();
    s.worker_memory_mb = get_memory_mb();
    
    return s;
}

void MetricsCollector::set_active_connections(int count) { active_connections_ = count; }
void MetricsCollector::set_queue_depth(int depth) { queue_depth_ = depth; }

double MetricsCollector::get_cpu_percent() { return 0.0; } // Placeholder
double MetricsCollector::get_memory_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
#ifdef __APPLE__
        return usage.ru_maxrss / (1024.0 * 1024.0); // maxrss is in bytes on mac
#else
        return usage.ru_maxrss / 1024.0; // maxrss is in kilobytes on linux
#endif
    }
    return 0.0;
}

} // namespace loadforge
