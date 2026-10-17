#!/usr/bin/env bash
# =============================================================================
# safe-deploy.sh: run a command on Bookie's VM only when no Teams call is live.
# A restart or rebuild during a call drops Bookie mid-conversation (it happened to Sallie twice).
#   ./safe-deploy.sh "sudo systemctl restart hermes-gateway-bookie"
# Runs from the workstation (over SSH to ${PUBLIC_DOMAIN}) or on the VM itself (locally).
# Exit 2 = refused because a call is in progress.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ $# -ge 1 ] || die "usage: $0 \"<command to run on the VM>\""

if [ "$(hostname)" = "${VM_NAME}" ]; then
  run() { bash -c "$1"; }
else
  run() { ssh "${VM_ADMIN_USER}@${PUBLIC_DOMAIN}" "$1"; }
fi

STATUS="$(run "curl -s -m 3 http://127.0.0.1:${BRIDGE_STATUS_PORT}/status" | grep -o '"status":"[a-z-]*"' || true)"
if printf '%s' "${STATUS}" | grep -q 'in-call\|ring'; then
  echo "REFUSED: call in progress (${STATUS}); deploy blocked." >&2
  exit 2
fi
echo "==> no live call (${STATUS:-bridge not answering}); running: $1"
run "$1"
