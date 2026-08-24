#pragma once
#include <string>
#include <vector>
#include <map>
#include <initializer_list>
#include <cstdint>

namespace loadforge {

class Json {
public:
    enum Type { Null, Bool, Number, String, Array, Object };
    
    Json();
    Json(bool b);
    Json(double n);
    Json(int n);
    Json(int64_t n);
    Json(uint64_t n);
    Json(const std::string& s);
    Json(const char* s);
    Json(std::initializer_list<std::pair<std::string, Json>> pairs);
    
    static Json array(std::initializer_list<Json> items = {});
    static Json object(std::initializer_list<std::pair<std::string, Json>> pairs = {});
    static Json parse(const std::string& str);
    
    std::string dump(int indent = -1) const;
    
    Json& operator[](const std::string& key);
    Json& operator[](size_t index);
    const Json& operator[](const std::string& key) const;
    const Json& operator[](size_t index) const;
    
    void push_back(const Json& item);
    
    bool is_null() const;
    bool is_bool() const;
    bool is_number() const;
    bool is_string() const;
    bool is_array() const;
    bool is_object() const;
    
    bool as_bool() const;
    double as_number() const;
    int as_int() const;
    int64_t as_int64() const;
    uint64_t as_uint64() const;
    std::string as_string() const;
    
    size_t size() const;
    bool has(const std::string& key) const;
    
private:
    Type type_;
    bool bool_val_;
    double num_val_;
    std::string str_val_;
    std::vector<Json> arr_val_;
    std::map<std::string, Json> obj_val_;
    
    void dump_impl(std::string& out, int indent, int depth) const;
};

struct MetricsSnapshot;
struct Config;

Json metrics_to_json(const MetricsSnapshot& snapshot);
Config config_from_json(const Json& json);
Json result_to_json(const MetricsSnapshot& final_snapshot, const Config& config, int64_t start_time_ms, int64_t end_time_ms);

} // namespace loadforge
