#include "loadforge/http_parser.h"
#include <sstream>
#include <algorithm>

namespace loadforge {

std::string HttpRequest::serialize() const {
    std::ostringstream oss;
    oss << method << " " << path << " HTTP/1.1\r\n";
    oss << "Host: " << host << "\r\n";
    for (const auto& kv : headers) {
        oss << kv.first << ": " << kv.second << "\r\n";
    }
    if (!body.empty()) {
        oss << "Content-Length: " << body.size() << "\r\n";
    }
    oss << "\r\n";
    oss << body;
    return oss.str();
}

HttpResponse HttpParser::parse(const std::string& raw_response) {
    HttpResponse res;
    res.total_bytes = raw_response.size();
    
    size_t header_end = raw_response.find("\r\n\r\n");
    if (header_end == std::string::npos) return res; // Incomplete
    
    res.header_bytes = header_end + 4;
    std::string headers_str = raw_response.substr(0, header_end);
    res.body = raw_response.substr(header_end + 4);
    res.body_bytes = res.body.size();
    
    std::istringstream iss(headers_str);
    std::string line;
    if (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        size_t space1 = line.find(' ');
        size_t space2 = line.find(' ', space1 + 1);
        if (space1 != std::string::npos && space2 != std::string::npos) {
            res.status_code = std::stoi(line.substr(space1 + 1, space2 - space1 - 1));
            res.status_text = line.substr(space2 + 1);
        }
    }
    
    while (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        size_t colon = line.find(':');
        if (colon != std::string::npos) {
            std::string key = line.substr(0, colon);
            std::string val = line.substr(colon + 1);
            val.erase(0, val.find_first_not_of(" \t"));
            std::transform(key.begin(), key.end(), key.begin(), ::tolower);
            res.headers[key] = val;
            
            if (key == "connection" && val == "keep-alive") {
                res.keep_alive = true;
            }
        }
    }
    
    return res;
}

bool HttpParser::is_complete(const std::string& buffer) {
    size_t header_end = buffer.find("\r\n\r\n");
    if (header_end == std::string::npos) return false;
    
    std::string headers = buffer.substr(0, header_end);
    std::transform(headers.begin(), headers.end(), headers.begin(), ::tolower);
    
    size_t cl_pos = headers.find("content-length:");
    if (cl_pos != std::string::npos) {
        size_t eol = headers.find("\r\n", cl_pos);
        std::string val = headers.substr(cl_pos + 15, eol - (cl_pos + 15));
        size_t cl = std::stoull(val);
        return buffer.size() >= header_end + 4 + cl;
    }
    
    if (headers.find("transfer-encoding: chunked") != std::string::npos) {
        return buffer.find("0\r\n\r\n") != std::string::npos;
    }
    
    return false;
}

} // namespace loadforge
