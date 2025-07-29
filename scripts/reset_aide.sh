#!/bin/bash
# File: scripts/reset_aide.sh
# AIDE Development Environment Reset Script
# Usage: ./scripts/reset_aide.sh [--hard]

set -e  # Exit on any error

echo "🤠 AIDE Environment Reset - Texas-tough, California-cool"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [[ ! -f "pixi.toml" ]]; then
    echo -e "${RED}❌ Not in AIDE root directory! Run from ~/aide-codium-extension${NC}"
    exit 1
fi

# Parse arguments
HARD_RESET=false
if [[ "$1" == "--hard" ]]; then
    HARD_RESET=true
    echo -e "${YELLOW}⚠️  HARD RESET MODE - This will nuke everything!${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Reset cancelled."
        exit 0
    fi
fi

echo -e "${BLUE}🔍 Step 1: Killing rogue processes${NC}"
# Kill any existing AIDE backend processes
echo "Terminating any running AIDE processes..."
pkill -f "uvicorn.*api:app" || true
pkill -f "uvicorn.*src.backend.api:app" || true
pkill -f "python.*api.py" || true

# Kill anything on our ports
for port in 8000 8001 8002; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
        echo "Killing process $pid on port $port"
        kill -9 $pid || true
    fi
done

echo -e "${BLUE}🧹 Step 2: Cleaning Python artifacts${NC}"
# Remove Python cache and compiled files
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true
find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

# Clear any cached model loading states
if [[ -f "src/backend/model_manager.py" ]]; then
    echo "Clearing model manager cache..."
    # This will clear the lru_cache on next import
    touch src/backend/model_manager.py
fi

echo -e "${BLUE}🔧 Step 3: Pixi environment cleanup${NC}"
if [[ "$HARD_RESET" == true ]]; then
    echo "Hard reset: Nuking pixi environment..."
    rm -rf .pixi/ || true
    pixi clean --all || true
else
    echo "Soft reset: Cleaning pixi cache..."
    pixi clean || true
fi

echo -e "${BLUE}📦 Step 4: Reinstalling dependencies${NC}"
if [[ "$HARD_RESET" == true ]]; then
    echo "Full pixi reinstall..."
    pixi install
else
    echo "Refreshing pixi environment..."
    pixi update
fi

echo -e "${BLUE}🔍 Step 5: Verifying critical files${NC}"
# Check for critical files that should exist
CRITICAL_FILES=(
    "src/backend/__init__.py"
    "src/backend/api.py"
    "src/backend/model_manager.py"
    "src/backend/code_review.py"
    "src/backend/debug_guide.py"
    "src/backend/memory.py"
    "src/backend/intent_handler.py"
    "src/backend/config.yaml"
)

missing_files=false
for file in "${CRITICAL_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}❌ Missing critical file: $file${NC}"
        missing_files=true
    else
        echo -e "${GREEN}✅ Found: $file${NC}"
    fi
done

if [[ "$missing_files" == true ]]; then
    echo -e "${YELLOW}⚠️  Some critical files are missing. You may need to restore them.${NC}"
fi

echo -e "${BLUE}🎯 Step 6: Testing environment${NC}"
echo "Testing Python imports..."
if pixi run python -c "
import sys
sys.path.append('src/backend')
import api
import model_manager
import code_review
import debug_guide
import memory
import intent_handler
print('✅ All imports successful')
" 2>/dev/null; then
    echo -e "${GREEN}✅ Python environment is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Some import issues detected. Check your backend modules.${NC}"
fi

echo -e "${BLUE}🚀 Step 7: Testing backend startup${NC}"
echo "Starting backend for 5 seconds to test..."
timeout 5s pixi run python -m uvicorn src.backend.api:app --host 0.0.0.0 --port 8000 &
startup_pid=$!

sleep 3

# Test if server is responding
if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend started successfully!${NC}"
    backend_healthy=true
else
    echo -e "${YELLOW}⚠️  Backend startup had issues${NC}"
    backend_healthy=false
fi

# Kill the test server
kill $startup_pid 2>/dev/null || true
wait $startup_pid 2>/dev/null || true

echo -e "${BLUE}📊 Step 8: Environment report${NC}"
echo "Environment Status Report:"
echo "========================="
echo "Pixi environment: $(if pixi list >/dev/null 2>&1; then echo 'OK'; else echo 'ISSUES'; fi)"
echo "Python backend: $(if [[ "$backend_healthy" == true ]]; then echo 'OK'; else echo 'ISSUES'; fi)"
echo "Critical files: $(if [[ "$missing_files" == false ]]; then echo 'OK'; else echo 'MISSING'; fi)"

# Show available models
echo ""
echo "Available models in models/ directory:"
if [[ -d "models" ]]; then
    ls -la models/ | grep "^d" | grep -v "\.$" | awk '{print "  - " $9}' || echo "  (no model directories found)"
else
    echo "  (models directory not found)"
fi

# Show dependency status
echo ""
echo "Key dependencies:"
for dep in transformers torch fastapi uvicorn; do
    if pixi list | grep -q "^$dep "; then
        version=$(pixi list | grep "^$dep " | awk '{print $2}')
        echo -e "  ${GREEN}✅ $dep ($version)${NC}"
    else
        echo -e "  ${RED}❌ $dep (missing)${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 Reset complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Start the backend: pixi run python -m uvicorn src.backend.api:app --reload --host 0.0.0.0 --port 8000"
echo "2. Test endpoints: curl http://localhost:8000/health"
echo "3. Test models: curl http://localhost:8000/models"
echo ""
echo "If you're still having issues, try: $0 --hard"
