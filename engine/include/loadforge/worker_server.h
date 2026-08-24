#pragma once
#include "engine.h"
#include <string>
#include <thread>
#include <atomic>
#include <memory>

namespace loadforge {

class WorkerServer {
public:
    WorkerServer(const std::string& worker_id, int port = 9090);
    ~WorkerServer();
    
    void start();
    void stop();
    
private:
    std::string worker_id_;
    int port_;
    int server_fd_ = -1;
    std::atomic<bool> running_{false};
    std::unique_ptr<LoadEngine> engine_;
    std::thread server_thread_;
    std::thread metrics_thread_;
    std::string controller_url_;
    
    void accept_loop();
    void handle_client(int client_fd);
    
    std::string handle_start_test(const std::string& body);
    std::string handle_stop_test();
    std::string handle_status();
    std::string handle_metrics();
    
    void send_response(int fd, int status_code, const std::string& body);
};

} // namespace loadforge
