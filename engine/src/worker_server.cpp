#include "loadforge/worker_server.h"
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

namespace loadforge {

WorkerServer::WorkerServer(const std::string& worker_id, int port) : worker_id_(worker_id), port_(port) {}

WorkerServer::~WorkerServer() { stop(); }

void WorkerServer::start() {
    // Minimal implementation for now
}

void WorkerServer::stop() {
    running_ = false;
}

} // namespace loadforge
