#!/usr/bin/env bash
set -e
mkdir -p aide-codium-extension/{build,scripts,src/extension/src,src/backend,src/ingest}
touch aide-codium-extension/scripts/{scaffold.sh,setup.sh}
chmod +x aide-codium-extension/scripts/scaffold.sh aide-codium-extension/scripts/setup.sh
touch aide-codium-extension/build/bundle.sh
chmod +x aide-codium-extension/build/bundle.sh
echo "Scaffolding complete."
