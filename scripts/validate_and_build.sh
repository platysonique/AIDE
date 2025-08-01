#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# scripts/validate_and_build.sh — Build & install the AIDE VSCode/Codium extension
# -----------------------------------------------------------------------------

# Determine this script's directory and the repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$REPO_ROOT/src/extension"
BUILD_DIR="$EXT_DIR/build"
VSIX_NAME="aide.vsix"

echo "🔍 Repo root: $REPO_ROOT"
echo "📦 Extension dir: $EXT_DIR"
echo

# 1) Install & bundle inside src/extension
echo "➡️ Installing node modules..."
npm --prefix "$EXT_DIR" install --legacy-peer-deps

echo "➡️ Bundling extension..."
npm --prefix "$EXT_DIR" run bundle

# 2) Package into VSIX - MUST cd into extension directory first!
echo "➡️ Packaging VSIX..."
mkdir -p "$BUILD_DIR"
(cd "$EXT_DIR" && npx vsce package --out "build/$VSIX_NAME")

# 3) Install into Codium/VSCode
echo "➡️ Installing extension into Codium..."
codium --install-extension "$BUILD_DIR/$VSIX_NAME"

echo "✅ Extension built and installed: $BUILD_DIR/$VSIX_NAME"
