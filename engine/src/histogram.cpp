#include "loadforge/histogram.h"
#include <cmath>
#include <algorithm>

namespace loadforge {

const double Histogram::BUCKET_BOUNDARIES[NUM_BUCKETS + 1] = {
    // Basic boundaries for logarithmic buckets
    // This is a simplified initialization, ideally we'd compute them dynamically
    // But for a constant array, we compute it in bucket_for/value_for
    // We'll use 1.0 as base and 1.1 multiplier
    0 // dummy, not fully used in static array here, logic handled in code
};

Histogram::Histogram() : min_(1e9), max_(0), sum_(0), count_(0) {
    for (int i = 0; i < NUM_BUCKETS; ++i) buckets_[i] = 0;
}

int Histogram::bucket_for(double value) const {
    if (value <= 1.0) return 0;
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
    buckets_[b].fetch_add(1, std::memory_order_relaxed);
    
    double current_min = min_.load(std::memory_order_relaxed);
    while (value < current_min && !min_.compare_exchange_weak(current_min, value, std::memory_order_relaxed)) {}
    
    double current_max = max_.load(std::memory_order_relaxed);
    while (value > current_max && !max_.compare_exchange_weak(current_max, value, std::memory_order_relaxed)) {}
    
    // sum is relaxed, precision loss at high concurrency is acceptable for load gen metrics
    double current_sum = sum_.load(std::memory_order_relaxed);
    while (!sum_.compare_exchange_weak(current_sum, current_sum + value, std::memory_order_relaxed)) {}
    
    count_.fetch_add(1, std::memory_order_relaxed);
}

double Histogram::percentile(double p) const {
    uint64_t total = count_.load(std::memory_order_relaxed);
    if (total == 0) return 0.0;
    
    uint64_t target = static_cast<uint64_t>(total * (p / 100.0));
    uint64_t acc = 0;
    for (int i = 0; i < NUM_BUCKETS; ++i) {
        acc += buckets_[i].load(std::memory_order_relaxed);
        if (acc >= target) {
            return value_for(i);
        }
    }
    return max_.load(std::memory_order_relaxed);
}

double Histogram::min() const { return count_.load() == 0 ? 0 : min_.load(); }
double Histogram::max() const { return count_.load() == 0 ? 0 : max_.load(); }
double Histogram::mean() const { 
    uint64_t c = count_.load();
    return c == 0 ? 0 : sum_.load() / c; 
}

uint64_t Histogram::count() const { return count_.load(); }

void Histogram::reset() {
    for (int i = 0; i < NUM_BUCKETS; ++i) buckets_[i].store(0);
    min_.store(1e9);
    max_.store(0);
    sum_.store(0);
    count_.store(0);
}

void Histogram::merge(const Histogram& other) {
    for (int i = 0; i < NUM_BUCKETS; ++i) {
        buckets_[i].fetch_add(other.buckets_[i].load(std::memory_order_relaxed));
    }
    double o_min = other.min_.load(std::memory_order_relaxed);
    double c_min = min_.load();
    while (o_min < c_min && !min_.compare_exchange_weak(c_min, o_min)) {}
    
    double o_max = other.max_.load(std::memory_order_relaxed);
    double c_max = max_.load();
    while (o_max > c_max && !max_.compare_exchange_weak(c_max, o_max)) {}
    
    double o_sum = other.sum_.load();
    double c_sum = sum_.load();
    while (!sum_.compare_exchange_weak(c_sum, c_sum + o_sum)) {}
    
    count_.fetch_add(other.count_.load());
}

Histogram::BucketData Histogram::get_buckets() const {
    BucketData data;
    for (int i = 0; i < NUM_BUCKETS; ++i) {
        data.boundaries.push_back(value_for(i));
        data.counts.push_back(buckets_[i].load());
    }
    return data;
}

} // namespace loadforge
