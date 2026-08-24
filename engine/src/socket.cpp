#include "loadforge/socket.h"
#include <unistd.h>
#include <sys/socket.h>
#include <netdb.h>
#include <poll.h>
#include <fcntl.h>
#include <netinet/tcp.h>
#include <stdexcept>
#include <cstring>

namespace loadforge {

Socket::Socket() {}

Socket::~Socket() {
    close();
}

Socket::Socket(Socket&& other) noexcept : fd_(other.fd_), connected_(other.connected_) {
    other.fd_ = -1;
    other.connected_ = false;
}

Socket& Socket::operator=(Socket&& other) noexcept {
    if (this != &other) {
        close();
        fd_ = other.fd_;
        connected_ = other.connected_;
        other.fd_ = -1;
        other.connected_ = false;
    }
    return *this;
}

bool Socket::connect(const std::string& host, int port, int timeout_ms) {
    struct addrinfo hints{}, *res;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    
    if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &res) != 0) return false;
    
    fd_ = ::socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (fd_ < 0) {
        freeaddrinfo(res);
        return false;
    }
    
    int opt = 1;
    setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    setsockopt(fd_, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
    
    int flags = fcntl(fd_, F_GETFL, 0);
    fcntl(fd_, F_SETFL, flags | O_NONBLOCK);
    
    int rc = ::connect(fd_, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);
    
    if (rc < 0 && errno != EINPROGRESS) {
        close();
        return false;
    }
    
    if (rc == 0) {
        fcntl(fd_, F_SETFL, flags);
        connected_ = true;
        return true;
    }
    
    struct pollfd pfd;
    pfd.fd = fd_;
    pfd.events = POLLOUT;
    
    if (poll(&pfd, 1, timeout_ms) > 0) {
        int so_error;
        socklen_t len = sizeof(so_error);
        getsockopt(fd_, SOL_SOCKET, SO_ERROR, &so_error, &len);
        if (so_error == 0) {
            fcntl(fd_, F_SETFL, flags);
            connected_ = true;
            return true;
        }
    }
    
    close();
    return false;
}

ssize_t Socket::send(const char* data, size_t len) {
    if (!connected_) return -1;
    return ::send(fd_, data, len, 0);
}

ssize_t Socket::recv(char* buffer, size_t len, int timeout_ms) {
    if (!connected_) return -1;
    
    struct pollfd pfd;
    pfd.fd = fd_;
    pfd.events = POLLIN;
    
    int p = poll(&pfd, 1, timeout_ms);
    if (p > 0) {
        return ::recv(fd_, buffer, len, 0);
    }
    return (p == 0) ? 0 : -1;
}

void Socket::close() {
    if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
    }
    connected_ = false;
}

bool Socket::is_connected() const { return connected_; }
int Socket::fd() const { return fd_; }

} // namespace loadforge
