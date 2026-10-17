#!/usr/bin/env bash
# =============================================================================
# Step 25: swap file (Azure VMs have none; without it a full RAM freezes Edge mid-call)
# Runs: ON the VM as the admin user. Idempotent: an existing /swapfile is left alone.
#   SWAP_SIZE=8G ./25-setup-swap.sh
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm

SWAP_SIZE="${SWAP_SIZE:-8G}"
step "Step 25: ${SWAP_SIZE} swap at /swapfile"
if swapon --show=NAME --noheadings | grep -qx /swapfile; then
  info "already active"
else
  [ -f /swapfile ] || sudo fallocate -l "${SWAP_SIZE}" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  info "enabled"
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-bookie-swap.conf >/dev/null
sudo sysctl -q -p /etc/sysctl.d/90-bookie-swap.conf
free -h
