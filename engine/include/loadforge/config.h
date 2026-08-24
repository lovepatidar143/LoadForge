#pragma once
#include <string>
#include <map>

namespace loadforge {

struct Config {
    std::string test_id;
    std::string target_url;
    std::string method = "GET";
    std::map<std::string, std::string> headers;
    std::string body;
    double requests_per_second = 0;  // 0 = unlimited
    int concurrency = 10;
    int duration_seconds = 10;
    int ramp_up_seconds = 0;
    int ramp_down_seconds = 0;
    int timeout_ms = 5000;
    bool keep_alive = true;
    int max_connections = 100;
};

} // namespace loadforge
