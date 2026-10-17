#!/usr/bin/env bash
# =============================================================================
# Step 07: Microsoft 365 licence for Bookie (Exchange mailbox + Teams)
# Runs: locally (Azure CLI as a licence admin). Idempotent: an assigned SKU is detected and skipped.
#   ./07-assign-license.sh --list     # show SKUs with free seats, then set M365_SKU_ID
# HUMAN CHECK: a free seat must exist (buy one in the M365 admin centre first if Consumed = Enabled).
# Teams calling needs a licence that includes Teams (e.g. Business Basic/Standard, or E3 + Teams).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local

if [ "${1:-}" = "--list" ]; then
  step "Licence SKUs in this tenant (Free = Enabled - Consumed)"
  az rest --method GET --url "https://graph.microsoft.com/v1.0/subscribedSkus" \
    --query "value[].{SKU:skuPartNumber, ID:skuId, Enabled:prepaidUnits.enabled, Consumed:consumedUnits}" -o table
  echo "Set M365_SKU_ID (export it or put it in config.env), then re-run without --list."
  exit 0
fi
require AGENT_UPN M365_SKU_ID

step "Step 07: licence ${M365_SKU_ID} for ${AGENT_UPN}"
if az rest --method GET --url "https://graph.microsoft.com/v1.0/users/${AGENT_UPN}/licenseDetails" \
     --query "value[].skuId" -o tsv | grep -qi "^${M365_SKU_ID}$"; then
  info "already assigned"
else
  FREE="$(az rest --method GET --url "https://graph.microsoft.com/v1.0/subscribedSkus" \
          --query "value[?skuId=='${M365_SKU_ID}'] | [0].[prepaidUnits.enabled, consumedUnits]" -o tsv | awk '{print $1-$2}')"
  [ "${FREE:-0}" -gt 0 ] || die "no free seat for SKU ${M365_SKU_ID} (free: ${FREE:-0}). Buy one, then re-run."
  az rest --method POST --url "https://graph.microsoft.com/v1.0/users/${AGENT_UPN}/assignLicense" \
    --headers "Content-Type=application/json" \
    --body "{\"addLicenses\":[{\"skuId\":\"${M365_SKU_ID}\",\"disabledPlans\":[]}],\"removeLicenses\":[]}" -o none
  info "assigned"
fi
az rest --method GET --url "https://graph.microsoft.com/v1.0/users/${AGENT_UPN}/licenseDetails" \
  --query "value[].{SKU:skuPartNumber}" -o table
echo "Mailbox provisioning takes a few minutes. Next: 08-restrict-email.ps1 and 09-restrict-teams.ps1 (PowerShell)."
