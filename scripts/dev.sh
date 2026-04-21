#!/usr/bin/env bash
# dev.sh — NextFrame local dev entry (v0.1.1 scaffold only).
# Real dev loop (app launch + hot reload) lands in v0.2.

set -euo pipefail

echo "nf-cli scaffold · running"
cargo run --bin nf -- "$@"
