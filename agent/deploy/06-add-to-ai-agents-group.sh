#!/usr/bin/env bash
# =============================================================================
# Step 06: put Bookie in the "AI Agents" groups
# Runs: locally. Part 1 (Azure CLI): the Entra security group (Information Barriers, Conditional
# Access). Part 2 (PowerShell + ExchangeOnlineManagement, interactive admin sign-in): the
# mail-enabled security group that the step 08 transport rules target (Exchange cannot see a
# plain Entra group). Both parts create the group when it does not exist yet (a self-hoster's
# first agent) and are idempotent.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local
require SECURITY_GROUP SECURITY_GROUP_NICKNAME AGENT_UPN

step "Step 06 part 1: Entra security group '${SECURITY_GROUP}'"
GID="$(az ad group show --group "${SECURITY_GROUP}" --query id -o tsv 2>/dev/null || true)"
if [ -z "${GID}" ]; then
  GID="$(az ad group create --display-name "${SECURITY_GROUP}" --mail-nickname "${SECURITY_GROUP_NICKNAME}" \
          --description "${SECURITY_GROUP_DESCRIPTION}" --query id -o tsv)"
  info "created"
else
  info "exists"
fi
UID_="$(az ad user show --id "${AGENT_UPN}" --query id -o tsv)"
if [ "$(az ad group member check --group "${GID}" --member-id "${UID_}" --query value -o tsv)" = "true" ]; then
  info "${AGENT_UPN} already a member"
else
  az ad group member add --group "${GID}" --member-id "${UID_}"
  info "added ${AGENT_UPN}"
fi

step "Step 06 part 2: Exchange mail-enabled security group (PowerShell)"
if command -v pwsh >/dev/null; then
  pwsh -NoProfile -File "${SCRIPT_DIR}/06-add-to-ai-agents-group.ps1" -ConfigFile "${CONFIG_ENV}"
else
  warn "pwsh not found. Run on a machine with PowerShell 7: pwsh ./06-add-to-ai-agents-group.ps1"
fi
echo "Next: 07-assign-license.sh"
