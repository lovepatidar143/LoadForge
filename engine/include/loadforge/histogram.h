#pragma once
#include <atomic>
#include <vector>
#include <cstdint>

namespace loadforge {

class Histogram {
public:
    Histogram();
    
    void record(double value);
    double percentile(double p) const;
    
    double min() const;
    double max() const;
    double mean() const;
    double median() const { return percentile(50.0); }
    double p50() const { return percentile(50.0); }
    double p90() const { return percentile(90.0); }
    double p95() const { return percentile(95.0); }
    double p99() const { return percentile(99.0); }
    double p999() const { return percentile(99.9); }
    
    uint64_t count() const;
    void reset();
    void merge(const Histogram& other);
    
    struct BucketData {
        std::vector<double> boundaries;
        std::vector<uint64_t> counts;
    };
    BucketData get_buckets() const;
    
private:
    static constexpr int NUM_BUCKETS = 200;
    std::atomic<uint64_t> buckets_[NUM_BUCKETS];
    std::atomic<double> min_;
    std::atomic<double> max_;
    std::atomic<double> sum_;
    std::atomic<uint64_t> count_;
    
    int bucket_for(double value) const;
    double value_for(int bucket) const;
    
    static const double BUCKET_BOUNDARIES[NUM_BUCKETS + 1];
};

} // namespace loadforge
