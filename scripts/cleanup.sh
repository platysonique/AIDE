#!/bin/bash

echo "Cleaning up AIDE backend processes..."

# Kill any Python processes running api.py
pkill -f "python.*api.py"

# Kill any processes using port 8000
if command -v lsof &> /dev/null; then
    lsof -ti:8000 | xargs kill -9 2>/dev/null
elif command -v netstat &> /dev/null; then
    netstat -tlnp | grep :8000 | awk '{print $7}' | cut -d'/' -f1 | xargs kill -9 2>/dev/null
fi

echo "Cleanup complete!"
