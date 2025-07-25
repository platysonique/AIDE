#!/usr/bin/env bash
set -euo pipefail

echo "==== AIDE for Codium: Automated Setup ===="

# Check prerequisites: Node.js, npm, TypeScript, Pixi
function check_prereq() {
    if ! command -v $1 >/dev/null 2>&1; then
        echo "Error: $1 is not installed. Please install it using the instructions in the README."
        exit 1
    fi
}

check_prereq node
check_prereq npm
check_prereq tsc
check_prereq pixi

# Check for pixi.toml/pixi.lock in the project root
if [ ! -f "pixi.toml" ] || [ ! -f "pixi.lock" ]; then
    echo "Error: pixi.toml and/or pixi.lock missing in the project root. Please ensure both are present."
    exit 1
fi

echo "- Installing all Python and system dependencies with Pixi..."
pixi install

echo "- Installing Node.js extension dependencies..."
cd src/extension
npm install
npm run bundle
cd ../../

# Optional: check Intel GPU drivers (for Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "- Checking for Intel GPU support (optional)..."
    if command -v intel_gpu_top >/dev/null 2>&1; then
        echo "Intel GPU tools detected."
    else
        echo "Warning: Intel GPU tools not found. For best performance, install Intel oneAPI and latest GPU drivers if using Arc A770."
    fi
fi

# Model files setup guidance
if [ ! -d "models" ] || [ -z "$(ls -A models 2>/dev/null)" ]; then
    echo "Notice: 'models/' directory is missing or empty."
    echo "Please place your DeepSeek R1 7B Qwen model files in the 'models/' directory before starting the backend."
fi

echo "- Setup complete!"
echo
echo "To activate the environment, run:"
echo "    pixi shell"
echo
echo "To launch the backend manually (not usually needed):"
echo "    pixi run python src/backend/api.py"
echo
echo "You may now open the project in VSCodium for full extension functionality."

