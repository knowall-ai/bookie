#!/usr/bin/env bash
# =============================================================================
# Step 01: resource group + Azure Linux VM for Bookie
# Runs: locally (Azure CLI). Idempotent: an existing group/VM is reused, tags re-applied.
# =============================================================================
# Creates ${RESOURCE_GROUP} and ${VM_NAME} (Ubuntu 22.04, system-assigned managed identity
# so the call-bot and Hermes reach Azure OpenAI without keys), opens 22/3389 (locked to your
# IP in step 12), 443 (Graph webhooks) and 80 (Let's Encrypt HTTP-01).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local
require RESOURCE_GROUP VM_NAME VM_LOCATION VM_SIZE VM_IMAGE VM_ADMIN_USER

read -r -a TAGS <<< "${VM_TAGS}"

step "Step 01: resource group ${RESOURCE_GROUP} (${VM_LOCATION})"
if az group show -n "${RESOURCE_GROUP}" -o none 2>/dev/null; then
  info "exists"
else
  az group create -n "${RESOURCE_GROUP}" -l "${VM_LOCATION}" --tags "${TAGS[@]}" -o none
  info "created"
fi

step "VM ${VM_NAME} (${VM_SIZE})"
if az vm show -g "${RESOURCE_GROUP}" -n "${VM_NAME}" -o none 2>/dev/null; then
  info "exists; re-applying tags and making sure the managed identity is on"
  az resource tag --is-incremental -g "${RESOURCE_GROUP}" -n "${VM_NAME}" \
    --resource-type Microsoft.Compute/virtualMachines --tags "${TAGS[@]}" -o none
  az vm identity assign -g "${RESOURCE_GROUP}" -n "${VM_NAME}" -o none
else
  az vm create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${VM_NAME}" \
    --location "${VM_LOCATION}" \
    --image "${VM_IMAGE}" \
    --size "${VM_SIZE}" \
    --admin-username "${VM_ADMIN_USER}" \
    --generate-ssh-keys \
    --os-disk-size-gb "${VM_DISK_SIZE}" \
    --public-ip-sku Standard \
    --nsg-rule SSH \
    --assign-identity '[system]' \
    --tags "${TAGS[@]}" \
    -o none
  info "created"
fi

# open-port is idempotent per priority (it updates the rule of that name).
for spec in "3389:1010:RDP for the admin desktop" "443:1020:HTTPS (Graph webhooks)" "80:1030:HTTP (Let's Encrypt validation)"; do
  IFS=: read -r port prio why <<< "${spec}"
  step "NSG: open ${port} (${why})"
  az vm open-port -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --port "${port}" --priority "${prio}" -o none
done

VM_IP=$(az vm show -d -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --query publicIps -o tsv)
PRINCIPAL=$(az vm identity show -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --query principalId -o tsv)
cat <<EOF

==> Done.
    Public IP:          ${VM_IP}
    Managed identity:   principal ${PRINCIPAL} (step 13 grants it Cognitive Services OpenAI User)
    DNS (manual):       A record ${PUBLIC_DOMAIN} -> ${VM_IP}   (needed before step 11)
    SSH:                ssh ${VM_ADMIN_USER}@${VM_IP}
Next: copy this repo's agent/deploy folder to the VM and run 02-setup-desktop.sh there.
EOF
