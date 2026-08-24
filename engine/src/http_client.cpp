#include "loadforge/http_client.h"
#include <chrono>
#include <cstring>

namespace loadforge {

RequestResult HttpClient::execute(const HttpRequest& request, int timeout_ms) {
    Socket socket;
    return execute(socket, request, timeout_ms);
}

RequestResult HttpClient::execute(Socket& socket, const HttpRequest& request, int timeout_ms) {
    RequestResult result;
    auto t0 = std::chrono::steady_clock::now();
    
    if (!socket.is_connected()) {
        if (!socket.connect(request.host, request.port, timeout_ms)) {
            result.error_type = "connect_timeout";
            result.error_message = "Failed to connect";
            return result;
        }
    }
    auto t1 = std::chrono::steady_clock::now();
    result.connect_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();
    
    std::string raw_req = request.serialize();
    ssize_t sent = socket.send(raw_req.c_str(), raw_req.size());
    if (sent < 0) {
        result.error_type = "send_error";
        return result;
    }
    result.bytes_sent = sent;
    
    auto t2 = std::chrono::steady_clock::now();
    result.send_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1).count();
    
    std::string response_buffer;
    char buf[4096];
    bool first_byte = false;
    
    while (true) {
        ssize_t r = socket.recv(buf, sizeof(buf), timeout_ms);
        if (r < 0) {
            result.error_type = "read_timeout";
            return result;
        } else if (r == 0) {
            break; // Connection closed
        }
        
        if (!first_byte) {
            auto t3 = std::chrono::steady_clock::now();
            result.ttfb_us = std::chrono::duration_cast<std::chrono::microseconds>(t3 - t2).count();
            first_byte = true;
        }
        
        response_buffer.append(buf, r);
        if (HttpParser::is_complete(response_buffer)) {
            break;
        }
    }
    
    auto t4 = std::chrono::steady_clock::now();
    result.download_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t2).count() - result.ttfb_us;
    result.total_time_us = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t0).count();
    
    result.bytes_received = response_buffer.size();
    result.response = HttpParser::parse(response_buffer);
    result.success = (result.response.status_code > 0);
    
    return result;
}

} // namespace loadforge
