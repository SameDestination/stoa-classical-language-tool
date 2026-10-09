#!/bin/zsh
set -euo pipefail

desktop_dir="${0:A:h}"
node "$desktop_dir/create-icon.mjs"
