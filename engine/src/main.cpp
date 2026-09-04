#include "loadforge/engine.h"
#include <iostream>
#include <iomanip>

using namespace loadforge;

void print_usage() {
    std::cerr << "LoadForge v0.1.0 — High-Performance HTTP Load Testing\n\n"
              << "Usage:\n"
              << "  loadforge --url <target> [options]\n\n"
              << "Options:\n"
              << "  --url <url>         Target URL to test (required)\n"
              << "  --rate <n>          Requests per second (default: 10)\n"
              << "  --duration <n>      Test duration in seconds (default: 10)\n"
              << "  --concurrency <n>   Number of worker threads (default: 10)\n"
              << "  --connections <n>   Max connections in pool (default: 100)\n"
              << "  --timeout <ms>      Request timeout in milliseconds (default: 5000)\n"
              << "  --method <method>   HTTP method: GET, POST, PUT, DELETE (default: GET)\n"
              << "  --header <k:v>      Add HTTP header (can repeat)\n"
              << "  --body <data>       Request body for POST/PUT\n"
              << "  --ramp-up <n>       Ramp-up period in seconds (default: 0)\n"
              << "  --ramp-down <n>     Ramp-down period in seconds (default: 0)\n"
              << "  --no-keepalive      Disable HTTP keep-alive\n"
              << "  --help              Show this help\n\n"
              << "Examples:\n"
              << "  loadforge --url http://localhost:8080/api/health --rate 100 --duration 10\n"
              << "  loadforge --url http://localhost:8080/api/users --method POST --body '{\"name\":\"test\"}' --rate 50\n"
              << "  loadforge --url http://myapi.com/endpoint --rate 1000 --duration 60 --concurrency 20\n";
}

int main(int argc, char* argv[]) {
    // Force line-buffered stdout so output appears immediately even in pipes/timeout
    std::ios_base::sync_with_stdio(true);
    std::cout << std::unitbuf;
    
    Config config;
    config.target_url = "";
    config.duration_seconds = 10;
    config.requests_per_second = 10;
    config.concurrency = 10;
    config.max_connections = 100;
    config.timeout_ms = 5000;
    
    if (argc < 2) {
        print_usage();
        return 1;
    }
    
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help" || arg == "-h") { print_usage(); return 0; }
        else if (arg == "--url" && i + 1 < argc) config.target_url = argv[++i];
        else if (arg == "--duration" && i + 1 < argc) config.duration_seconds = std::stoi(argv[++i]);
        else if (arg == "--rate" && i + 1 < argc) config.requests_per_second = std::stoi(argv[++i]);
        else if (arg == "--concurrency" && i + 1 < argc) config.concurrency = std::stoi(argv[++i]);
        else if (arg == "--connections" && i + 1 < argc) config.max_connections = std::stoi(argv[++i]);
        else if (arg == "--timeout" && i + 1 < argc) config.timeout_ms = std::stoi(argv[++i]);
        else if (arg == "--method" && i + 1 < argc) config.method = argv[++i];
        else if (arg == "--body" && i + 1 < argc) config.body = argv[++i];
        else if (arg == "--ramp-up" && i + 1 < argc) config.ramp_up_seconds = std::stoi(argv[++i]);
        else if (arg == "--ramp-down" && i + 1 < argc) config.ramp_down_seconds = std::stoi(argv[++i]);
        else if (arg == "--no-keepalive") config.keep_alive = false;
        else if (arg == "--header" && i + 1 < argc) {
            std::string hdr = argv[++i];
            auto pos = hdr.find(':');
            if (pos != std::string::npos) {
                std::string key = hdr.substr(0, pos);
                std::string val = hdr.substr(pos + 1);
                // Trim leading space from value
                if (!val.empty() && val[0] == ' ') val = val.substr(1);
                config.headers[key] = val;
            }
        }
    }
    
    if (config.target_url.empty()) {
        std::cerr << "Error: --url is required\n\n";
        print_usage();
        return 1;
    }
    
    std::cout << "╔══════════════════════════════════════════╗\n";
    std::cout << "║        LoadForge v0.1.0                  ║\n";
    std::cout << "║   High-Performance HTTP Load Testing     ║\n";
    std::cout << "╚══════════════════════════════════════════╝\n\n";
    
    std::cout << "Configuration:\n";
    std::cout << "  Target:      " << config.target_url << "\n";
    std::cout << "  Method:      " << config.method << "\n";
    std::cout << "  Rate:        " << config.requests_per_second << " RPS\n";
    std::cout << "  Duration:    " << config.duration_seconds << "s\n";
    std::cout << "  Concurrency: " << config.concurrency << " threads\n";
    std::cout << "  Connections:  " << config.max_connections << " max\n";
    std::cout << "  Timeout:     " << config.timeout_ms << " ms\n";
    std::cout << "  Keep-Alive:  " << (config.keep_alive ? "enabled" : "disabled") << "\n";
    if (config.ramp_up_seconds > 0)
        std::cout << "  Ramp-Up:     " << config.ramp_up_seconds << "s\n";
    if (config.ramp_down_seconds > 0)
        std::cout << "  Ramp-Down:   " << config.ramp_down_seconds << "s\n";
    if (!config.body.empty())
        std::cout << "  Body:        " << config.body.size() << " bytes\n";
    if (!config.headers.empty())
        std::cout << "  Headers:     " << config.headers.size() << " custom\n";
    std::cout << "\nRunning test...\n\n";
    
    LoadEngine engine(config);
    engine.set_metrics_callback([](const MetricsSnapshot& s) {
        std::cout << "  RPS: " << std::setw(8) << std::fixed << std::setprecision(1) << s.current_rps 
                  << " | Latency P50: " << std::setw(6) << s.latency_p50_ms << " ms"
                  << " | P99: " << std::setw(6) << std::setprecision(1) << s.latency_p99_ms << " ms"
                  << " | Errors: " << s.failed_requests
                  << " | Conn: " << s.active_connections
                  << "\n";
    });
    
    MetricsSnapshot final_metrics = engine.run();
    
    std::cout << "\n╔══════════════════════════════════════════╗\n";
    std::cout << "║            TEST COMPLETE                 ║\n";
    std::cout << "╚══════════════════════════════════════════╝\n\n";
    std::cout << "Results:\n";
    std::cout << "  Total Requests:  " << final_metrics.total_requests << "\n";
    std::cout << "  Successful:      " << final_metrics.successful_requests << "\n";
    std::cout << "  Failed:          " << final_metrics.failed_requests << "\n";
    std::cout << "  Success Rate:    " << std::fixed << std::setprecision(1);
    if (final_metrics.total_requests > 0) {
        std::cout << (100.0 * final_metrics.successful_requests / final_metrics.total_requests) << "%\n";
    } else {
        std::cout << "N/A\n";
    }
    std::cout << "\nLatency:\n";
    std::cout << "  P50:  " << final_metrics.latency_p50_ms << " ms\n";
    std::cout << "  P95:  " << final_metrics.latency_p95_ms << " ms\n";
    std::cout << "  P99:  " << final_metrics.latency_p99_ms << " ms\n";
    std::cout << "\nThroughput:\n";
    std::cout << "  Avg RPS:     " << final_metrics.current_rps << "\n";
    std::cout << "  Bytes Sent:  " << final_metrics.bytes_sent << "\n";
    std::cout << "  Bytes Recv:  " << final_metrics.bytes_received << "\n";
    
    return 0;
}
