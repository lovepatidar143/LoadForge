#!/bin/bash
# Build the C++ engine locally
cd "$(dirname "$0")/../engine" || exit 1
mkdir -p build
cd build || exit 1
cmake ..
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)
echo "Build complete: engine/build/loadforge"
