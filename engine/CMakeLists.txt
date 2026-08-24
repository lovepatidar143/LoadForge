cmake_minimum_required(VERSION 3.14)
project(loadforge-engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wpedantic")

include_directories(include)

set(SOURCES
    src/main.cpp
    src/socket.cpp
    src/url_parser.cpp
    src/http_parser.cpp
    src/http_client.cpp
    src/connection_pool.cpp
    src/thread_pool.cpp
    src/rate_limiter.cpp
    src/histogram.cpp
    src/metrics.cpp
    src/engine.cpp
    src/json.cpp
    src/worker_server.cpp
)

add_executable(loadforge ${SOURCES})
target_link_libraries(loadforge pthread)

set(TEST_SOURCES
    tests/test_main.cpp
    tests/test_url_parser.cpp
    tests/test_histogram.cpp
    tests/test_rate_limiter.cpp
    tests/test_thread_pool.cpp
    tests/test_json.cpp
    src/url_parser.cpp
    src/histogram.cpp
    src/rate_limiter.cpp
    src/thread_pool.cpp
    src/json.cpp
)

add_executable(loadforge_tests ${TEST_SOURCES})
target_link_libraries(loadforge_tests pthread)
