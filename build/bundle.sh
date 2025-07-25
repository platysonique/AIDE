#!/usr/bin/env bash
set -e
cd src/extension
rm -rf out
npm run bundle
mkdir -p ../../build/dist
cp -r out/* ../../build/dist/
npx vsce package --out ../../build/dist/aide-codium.vsix
echo "Bundled extension at build/dist/aide-codium.vsix"
