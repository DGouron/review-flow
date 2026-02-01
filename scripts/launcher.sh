#!/bin/bash

# Claude Review Automation Launcher
# Starts the server and opens the dashboard in the browser

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3847
LOG_FILE="$PROJECT_DIR/logs/server.log"

# Create logs directory if needed
mkdir -p "$PROJECT_DIR/logs"

# Check if server is already running
if lsof -i :$PORT > /dev/null 2>&1; then
    # Server already running, just open dashboard
    xdg-open "http://localhost:$PORT/dashboard/" &
    exit 0
fi

# Start server in background
cd "$PROJECT_DIR"
nohup yarn dev > "$LOG_FILE" 2>&1 &

# Wait for server to be ready
echo "Starting server..."
for i in {1..30}; do

    if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Open dashboard
xdg-open "http://localhost:$PORT/dashboard/" &
