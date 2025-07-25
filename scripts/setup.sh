#!/usr/bin/env bash
set -euo pipefail

if ! command -v pixi >/dev/null 2>&1; then
    echo "Error: Pixi is not installed. Please install Pixi from https://pixi.sh/docs/install/"
    exit 1
fi

pixi install
