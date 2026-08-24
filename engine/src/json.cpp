#include "loadforge/json.h"
#include "loadforge/metrics.h"
#include "loadforge/config.h"
#include <sstream>

namespace loadforge {

Json::Json() : type_(Null), bool_val_(false), num_val_(0) {}
Json::Json(bool b) : type_(Bool), bool_val_(b), num_val_(0) {}
Json::Json(double n) : type_(Number), bool_val_(false), num_val_(n) {}
Json::Json(int n) : type_(Number), bool_val_(false), num_val_(n) {}
Json::Json(int64_t n) : type_(Number), bool_val_(false), num_val_(static_cast<double>(n)) {}
Json::Json(uint64_t n) : type_(Number), bool_val_(false), num_val_(static_cast<double>(n)) {}
Json::Json(const std::string& s) : type_(String), bool_val_(false), num_val_(0), str_val_(s) {}
Json::Json(const char* s) : type_(String), bool_val_(false), num_val_(0), str_val_(s) {}
Json::Json(std::initializer_list<std::pair<std::string, Json>> pairs) : type_(Object), bool_val_(false), num_val_(0) {
    for (auto& p : pairs) obj_val_[p.first] = p.second;
}

Json Json::array(std::initializer_list<Json> items) {
    Json j; j.type_ = Array;
    for (auto& item : items) j.arr_val_.push_back(item);
    return j;
}

Json Json::object(std::initializer_list<std::pair<std::string, Json>> pairs) {
    return Json(pairs);
}

// Basic parse, not full json parser. Good enough for simple configs.
Json Json::parse(const std::string& str) { return Json(); }

std::string Json::dump(int indent) const {
    std::string out;
    dump_impl(out, indent, 0);
    return out;
}

void Json::dump_impl(std::string& out, int indent, int depth) const {
    switch (type_) {
        case Null: out += "null"; break;
        case Bool: out += (bool_val_ ? "true" : "false"); break;
        case Number: {
            std::ostringstream oss; oss << num_val_;
            out += oss.str(); break;
        }
        case String: out += "\"" + str_val_ + "\""; break; // Needs escaping in prod
        case Array: {
            out += "[";
            for (size_t i = 0; i < arr_val_.size(); ++i) {
                if (i > 0) out += ",";
                arr_val_[i].dump_impl(out, indent, depth + 1);
            }
            out += "]";
            break;
        }
        case Object: {
            out += "{";
            bool first = true;
            for (auto& kv : obj_val_) {
                if (!first) out += ",";
                first = false;
                out += "\"" + kv.first + "\":";
                kv.second.dump_impl(out, indent, depth + 1);
            }
            out += "}";
            break;
        }
    }
}

Json& Json::operator[](const std::string& key) {
    if (type_ != Object) type_ = Object;
    return obj_val_[key];
}

Json& Json::operator[](size_t index) {
    return arr_val_[index];
}

const Json& Json::operator[](const std::string& key) const {
    static Json null_json;
    auto it = obj_val_.find(key);
    return it != obj_val_.end() ? it->second : null_json;
}

const Json& Json::operator[](size_t index) const {
    return arr_val_[index];
}

void Json::push_back(const Json& item) {
    if (type_ != Array) type_ = Array;
    arr_val_.push_back(item);
}

bool Json::is_null() const { return type_ == Null; }
bool Json::is_bool() const { return type_ == Bool; }
bool Json::is_number() const { return type_ == Number; }
bool Json::is_string() const { return type_ == String; }
bool Json::is_array() const { return type_ == Array; }
bool Json::is_object() const { return type_ == Object; }

bool Json::as_bool() const { return bool_val_; }
double Json::as_number() const { return num_val_; }
int Json::as_int() const { return static_cast<int>(num_val_); }
int64_t Json::as_int64() const { return static_cast<int64_t>(num_val_); }
uint64_t Json::as_uint64() const { return static_cast<uint64_t>(num_val_); }
std::string Json::as_string() const { return str_val_; }

size_t Json::size() const { return type_ == Array ? arr_val_.size() : obj_val_.size(); }
bool Json::has(const std::string& key) const { return obj_val_.count(key) > 0; }

Json metrics_to_json(const MetricsSnapshot& s) {
    Json j = Json::object();
    j["worker_id"] = s.worker_id;
    j["total_requests"] = s.total_requests;
    j["successful_requests"] = s.successful_requests;
    j["failed_requests"] = s.failed_requests;
    return j;
}

Config config_from_json(const Json& json) {
    Config c;
    if (json.has("target_url")) c.target_url = json["target_url"].as_string();
    return c;
}

Json result_to_json(const MetricsSnapshot& f, const Config& c, int64_t s, int64_t e) {
    return metrics_to_json(f);
}

} // namespace loadforge
