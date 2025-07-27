#!/bin/bash
set -e

echo "🧹 AIDE Project Validation (Pixi-Compatible)"
echo "============================================"

cd "$(dirname "$0")/.."

# 1. Validate only project JSON files
echo "📦 Validating project JSON files..."
find . -name "*.json" \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./.pixi/*" \
  -not -path "./src/extension/node_modules/*" \
  -not -path "./build/*" \
  -not -path "./out/*" \
  -not -path "./dist/*" | while read -r file; do
  echo "  Checking $file..."
  if ! jq . "$file" > /dev/null 2>&1; then
    echo "  ❌ Invalid JSON: $file"
    exit 1
  fi
done
echo "  ✅ All project JSON files valid"

# 2. Python backend validation (using pixi)
echo "🐍 Validating Python backend..."
cd src/backend

# Check if we're in a pixi environment
if command -v pixi &> /dev/null && [ -f "../../pixi.toml" ]; then
  echo "  Using pixi environment..."
  
  # Try ruff via pixi
  if pixi run ruff --version &> /dev/null; then
    echo "  Running ruff check..."
    pixi run ruff check .
  else
    echo "  ⚠️  ruff not found in pixi env, skipping Python linting"
  fi

  # Check Python syntax via pixi (FIXED - single line commands)
  echo "  Checking Python syntax..."
  for py_file in *.py; do
    if [ -f "$py_file" ]; then
      echo "    Checking $py_file..."
      if pixi run python -c "import py_compile; py_compile.compile('$py_file', doraise=True)"; then
        echo "    ✅ $py_file syntax valid"
      else
        echo "    ❌ $py_file syntax error"
        exit 1
      fi
    fi
  done
else
  # Fallback to system python
  if command -v python3 &> /dev/null; then
    echo "  Using system python3..."
    for py_file in *.py; do
      if [ -f "$py_file" ]; then
        echo "    Checking $py_file..."
        if python3 -c "import py_compile; py_compile.compile('$py_file', doraise=True)"; then
          echo "    ✅ $py_file syntax valid"
        else
          echo "    ❌ $py_file syntax error"
          exit 1
        fi
      fi
    done
  else
    echo "  ⚠️  No Python found, skipping syntax check"
  fi
fi

echo "  ✅ Python backend validation complete"
cd ../..

# 3. TypeScript extension validation
echo "📦 Validating TypeScript extension..."
cd src/extension

echo "  Installing dependencies..."
npm install --legacy-peer-deps

echo "  Running TypeScript compiler..."
npx tsc --noEmit

echo "  Building extension..."
npm run bundle

echo "  Packaging extension..."
npx vsce package --out aide.vsix

echo "✅ Extension packaged successfully: aide.vsix"

cd ../..

echo ""
echo "🎉 AIDE Project is SQUEAKY CLEAN!"
echo "Ready to install with: codium --install-extension src/extension/aide.vsix"

