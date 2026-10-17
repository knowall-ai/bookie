#!/usr/bin/env bash
# =============================================================================
# Step 12: lock the VM's NSG down
# Runs: locally (Azure CLI). Idempotent: re-run with a new IP when yours changes.
#   ./12-lockdown-nsg.sh [ADMIN_IP]     # default ADMIN_SOURCE_IP, else your current public IP
# SSH (22) and RDP (3389): your IP only. HTTPS (443): open (Graph webhooks; Caddy serves only
# /webhooks/*). HTTP (80): open for Let's Encrypt HTTP-01 renewals. Nothing else inbound.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local
require RESOURCE_GROUP VM_NAME

NSG_NAME="${NSG_NAME:-${VM_NAME}NSG}"
ADMIN_IP="${1:-${ADMIN_SOURCE_IP:-$(curl -s --max-time 5 https://ifconfig.me)}}"
[[ "${ADMIN_IP}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?$ ]] || die "could not determine an IPv4 admin address (got '${ADMIN_IP}')"

step "Step 12: NSG ${NSG_NAME}: SSH/RDP from ${ADMIN_IP} only"
az network nsg show -g "${RESOURCE_GROUP}" -n "${NSG_NAME}" -o none || die "NSG ${NSG_NAME} not found (set NSG_NAME)"
for rule in default-allow-ssh open-port-3389; do
  if az network nsg rule show -g "${RESOURCE_GROUP}" --nsg-name "${NSG_NAME}" -n "${rule}" -o none 2>/dev/null; then
    az network nsg rule update -g "${RESOURCE_GROUP}" --nsg-name "${NSG_NAME}" -n "${rule}" \
      --source-address-prefixes "${ADMIN_IP}" -o none
    info "${rule}: source ${ADMIN_IP}"
  else
    warn "rule ${rule} not found; check the NSG by hand"
  fi
done

az network nsg rule list -g "${RESOURCE_GROUP}" --nsg-name "${NSG_NAME}" \
  --query "sort_by([], &priority)[].{Name:name, Port:destinationPortRange, Source:sourceAddressPrefix, Priority:priority, Access:access}" -o table
echo "Next: 13-create-ai-resource.sh"
