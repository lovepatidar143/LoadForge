#include "loadforge/engine.h"
#include "loadforge/url_parser.h"
#include <iostream>

namespace loadforge {

LoadEngine::LoadEngine(const Config& config) : config_(config) {
    UrlComponents url = UrlParser::parse(config_.target_url);
    host_ = url.host;
    port_ = url.port;
    path_ = url.path + (url.query.empty() ? "" : "?" + url.query);
    
    pool_ = std::make_unique<ConnectionPool>(host_, port_, config_.max_connections);
    thread_pool_ = std::make_unique<ThreadPool>(config_.concurrency);
    limiter_ = std::make_unique<RateLimiter>(config_.requests_per_second);
    metrics_ = std::make_unique<MetricsCollector>("local", config_.test_id);
}

LoadEngine::~LoadEngine() {
    stop();
}

MetricsSnapshot LoadEngine::run() {
    running_ = true;
    stop_requested_ = false;
    
    std::thread reporter(&LoadEngine::metrics_reporter_loop, this);
    
    auto start_time = std::chrono::steady_clock::now();
    
    while (!stop_requested_) {
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(now - start_time).count();
        
        if (config_.duration_seconds > 0 && elapsed >= config_.duration_seconds) {
            break;
        }
        
        double current_rate = calculate_current_rate(elapsed);
        limiter_->set_rate(current_rate);
        
        limiter_->acquire();
        if (stop_requested_) break;
        
        thread_pool_->submit([this] {
            execute_request();
        });
    }
    
    thread_pool_->shutdown();
    running_ = false;
    
    if (reporter.joinable()) reporter.join();
    
    return metrics_->final_snapshot();
}

void LoadEngine::stop() {
    stop_requested_ = true;
}

bool LoadEngine::is_running() const {
    return running_;
}

MetricsSnapshot LoadEngine::current_metrics() {
    return metrics_->snapshot();
}

void LoadEngine::set_metrics_callback(MetricsCallback cb) {
    metrics_callback_ = cb;
}

void LoadEngine::execute_request() {
    Socket sock = pool_->acquire(config_.timeout_ms);
    if (!sock.is_connected()) {
        RequestResult err;
        err.success = false;
        err.error_type = "pool_timeout";
        metrics_->record_request(err);
        return;
    }
    
    HttpRequest req;
    req.method = config_.method;
    req.host = host_;
    req.port = port_;
    req.path = path_;
    req.headers = config_.headers;
    req.body = config_.body;
    if (config_.keep_alive) req.headers["Connection"] = "keep-alive";
    
    HttpClient client;
    RequestResult result = client.execute(sock, req, config_.timeout_ms);
    
    metrics_->record_request(result);
    
    if (config_.keep_alive && result.response.keep_alive && result.success) {
        pool_->release(std::move(sock));
    } else {
        pool_->discard(std::move(sock));
    }
}

void LoadEngine::metrics_reporter_loop() {
    while (running_) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        metrics_->set_active_connections(pool_->active_count());
        metrics_->set_queue_depth(thread_pool_->queue_depth());
        if (metrics_callback_ && running_) {
            metrics_callback_(metrics_->snapshot());
        }
    }
}

double LoadEngine::calculate_current_rate(double elapsed_seconds) {
    if (config_.requests_per_second <= 0) return 0;
    if (elapsed_seconds < config_.ramp_up_seconds) {
        return config_.requests_per_second * (elapsed_seconds / config_.ramp_up_seconds);
    }
    if (config_.duration_seconds > 0 && config_.ramp_down_seconds > 0) {
        double remaining = config_.duration_seconds - elapsed_seconds;
        if (remaining < config_.ramp_down_seconds) {
            return config_.requests_per_second * (remaining / config_.ramp_down_seconds);
        }
    }
    return config_.requests_per_second;
}

} // namespace loadforge
