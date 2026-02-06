#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# setup-plugins.sh
#
# Installs local NodeBB plugins that live in this repo and are
# not part of the upstream npm registry.  Run this ONCE after
# cloning (or after a fresh npm install) and before ./nodeBB build.
#
# Usage:
#   chmod +x setup-plugins.sh   # first time only
#   ./setup-plugins.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "── Installing local plugins ──────────────────────────────"

# 1. Install the topic-type composer plugin (Question / Note selector)
echo "  → nodebb-plugin-topic-type"
cd "$REPO_ROOT"
npm install --save "./nodebb-plugin-topic-type"

# 2. Activate it in NodeBB (writes to the database)
echo "  → Activating plugin …"
./nodebb activate nodebb-plugin-topic-type

echo ""
echo "── Done! Now rebuild and restart: ────────────────────────"
echo "   ./nodebb build && ./nodebb restart"
