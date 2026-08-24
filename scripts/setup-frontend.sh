#!/bin/bash
# Install frontend dependencies
cd "$(dirname "$0")/../frontend" || exit 1
npm install
echo "Frontend setup complete"
