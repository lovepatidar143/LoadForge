#include "loadforge/url_parser.h"
#include <regex>

namespace loadforge {

UrlComponents UrlParser::parse(const std::string& url) {
    UrlComponents result;
    std::regex url_regex(R"(^(([^:\/?#]+):)?(//([^\/?#:]*)(:([0-9]+))?)?([^?#]*)(\?([^#]*))?)");
    std::smatch url_match_result;

    if (std::regex_match(url, url_match_result, url_regex)) {
        result.scheme = url_match_result[2];
        result.host = url_match_result[4];
        std::string port_str = url_match_result[6];
        if (!port_str.empty()) {
            result.port = std::stoi(port_str);
        } else {
            result.port = (result.scheme == "https") ? 443 : 80;
        }
        result.path = url_match_result[7];
        if (result.path.empty()) {
            result.path = "/";
        }
        result.query = url_match_result[9];
    }
    return result;
}

} // namespace loadforge
