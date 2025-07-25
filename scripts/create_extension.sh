#!/usr/bin/env bash
set -euo pipefail

echo "==== AIDE for Codium: Automated Setup & Extension Installation ===="

# Function: Check for a required command
function ensure_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: $1 is required but not installed. Please install it following project README instructions."
        exit 1
    fi
}

# Check prerequisites: Node.js, npm, TypeScript, Pixi
ensure_cmd node
ensure_cmd npm
ensure_cmd tsc
ensure_cmd pixi

# Verify existence of Pixi project files
if [ ! -f "pixi.toml" ] || [ ! -f "pixi.lock" ]; then
    echo "Error: pixi.toml and/or pixi.lock missing in project root."
    exit 1
fi

echo "- Installing Python dependencies with Pixi..."
pixi install

echo "- Installing Node.js extension dependencies..."
cd src/extension
npm install
npm run bundle

# Package with vsce (if not installed, notify user)
if ! command -v vsce >/dev/null 2>&1; then
    echo "vsce not found; installing locally..."
    npm install -g vsce
fi
mkdir -p ../../build/dist
npx vsce package --out ../../build/dist/aide-codium.vsix

cd ../../

echo "- Extension package created at build/dist/aide-codium.vsix"

# Model file reminder
if [ ! -d "models" ] || [ -z "$(ls -A models 2>/dev/null)" ]; then
    echo "Notice: 'models/' directory is missing or empty."
    echo "Place your DeepSeek R1 7B Qwen model files in 'models/'."
fi

# Detect installed editors for extension installation
function install_extension() {
    local editor="$1"
    local code_bin="$2"
    if command -v "$code_bin" >/dev/null 2>&1; then
        echo "- Installing extension into $editor..."
        "$code_bin" --install-extension build/dist/aide-codium.vsix --force
        echo "  Installed in $editor."
    else
        echo "  $editor not found; skipping."
    fi
}

echo
echo "==== Extension Installation ===="

install_extension "Visual Studio Code" code
install_extension "VSCodium" codium

echo
echo "==== Installation Summary ===="
echo "  - If both VS Code and VSCodium are present, extension has been installed in both."
echo "  - If neither editor was found, manually drag-and-drop the '.vsix' file into the Extensions pane of your editor."
echo "  - To activate the development environment:"
echo "        pixi shell"
echo "  - To start the backend manually (advanced):"
echo "        pixi run python src/backend/api.py"
echo
echo "Setup complete! Open your preferred editor and enjoy AIDE for Codium."

