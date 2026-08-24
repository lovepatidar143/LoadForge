#include "loadforge/engine.h"
#include <iostream>
#include <iomanip>

using namespace loadforge;

int main(int argc, char* argv[]) {
    std::cout << "LoadForge v0.1.0\n";
    
    Config config;
    config.target_url = "http://example.com/";
    config.duration_seconds = 1;
    config.requests_per_second = 10;
    
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--url" && i + 1 < argc) config.target_url = argv[++i];
        if (arg == "--duration" && i + 1 < argc) config.duration_seconds = std::stoi(argv[++i]);
        if (arg == "--rate" && i + 1 < argc) config.requests_per_second = std::stoi(argv[++i]);
    }
    
    std::cout << "Target: " << config.target_url << "\n";
    std::cout << "Duration: " << config.duration_seconds << "s\n";
    
    LoadEngine engine(config);
    engine.set_metrics_callback([](const MetricsSnapshot& s) {
        std::cout << "RPS: " << s.current_rps << " | Active conn: " << s.active_connections << "\n";
    });
    
    MetricsSnapshot final_metrics = engine.run();
    
    std::cout << "\nTest Complete!\n";
    std::cout << "Total Requests: " << final_metrics.total_requests << "\n";
    std::cout << "Successful: " << final_metrics.successful_requests << "\n";
    std::cout << "Failed: " << final_metrics.failed_requests << "\n";
    std::cout << "Latency P50 (ms): " << final_metrics.latency_p50_ms << "\n";
    std::cout << "Latency P99 (ms): " << final_metrics.latency_p99_ms << "\n";
    
    return 0;
}
