#pragma once
#include <string>

namespace loadforge {

struct UrlComponents {
    std::string scheme;
    std::string host;
    int port = 80;
    std::string path;
    std::string query;
};

class UrlParser {
public:
    static UrlComponents parse(const std::string& url);
};

} // namespace loadforge
