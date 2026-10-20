#!/usr/bin/env bash
# Compatibility entry point for the GitHub Actions deployment installer.
set -Eeuo pipefail
site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$site_dir/scripts/deploy/install-autodeploy.sh" "$@"
