#pragma once
#include <string>
#include <map>

namespace loadforge {

struct HttpRequest {
    std::string method;
    std::string path;
    std::string host;
    int port = 80;
    std::map<std::string, std::string> headers;
    std::string body;
    
    std::string serialize() const;
};

struct HttpResponse {
    int status_code = 0;
    std::string status_text;
    std::map<std::string, std::string> headers;
    std::string body;
    size_t header_bytes = 0;
    size_t body_bytes = 0;
    size_t total_bytes = 0;
    
    bool keep_alive = false;
};

class HttpParser {
public:
    static HttpResponse parse(const std::string& raw_response);
    static bool is_complete(const std::string& buffer);
};

} // namespace loadforge
