#!/bin/bash
# Install controller dependencies
cd "$(dirname "$0")/../controller" || exit 1
npm install
echo "Controller setup complete"
