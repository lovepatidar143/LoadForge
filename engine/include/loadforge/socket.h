#pragma once
#include <string>
#include <sys/types.h>

namespace loadforge {

class Socket {
public:
    Socket();
    ~Socket();  // closes fd
    Socket(Socket&& other) noexcept;  // move constructor
    Socket& operator=(Socket&& other) noexcept;  // move assignment
    
    // No copy
    Socket(const Socket&) = delete;
    Socket& operator=(const Socket&) = delete;
    
    bool connect(const std::string& host, int port, int timeout_ms = 5000);
    ssize_t send(const char* data, size_t len);
    ssize_t recv(char* buffer, size_t len, int timeout_ms = 5000);
    void close();
    bool is_connected() const;
    int fd() const;
    
private:
    int fd_ = -1;
    bool connected_ = false;
};

} // namespace loadforge
