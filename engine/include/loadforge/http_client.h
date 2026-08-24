#pragma once
#include "http_parser.h"
#include "socket.h"
#include <string>

namespace loadforge {

struct RequestResult {
    bool success = false;
    HttpResponse response;
    
    // Timing (microseconds)
    int64_t connect_time_us = 0;
    int64_t send_time_us = 0;
    int64_t ttfb_us = 0;
    int64_t download_time_us = 0;
    int64_t total_time_us = 0;
    
    size_t bytes_sent = 0;
    size_t bytes_received = 0;
    
    std::string error_message;
    std::string error_type;
};

class HttpClient {
public:
    RequestResult execute(const HttpRequest& request, int timeout_ms = 5000);
    RequestResult execute(Socket& socket, const HttpRequest& request, int timeout_ms = 5000);
};

} // namespace loadforge
