#!/usr/bin/env bash
# =============================================================================
# Step 05: Bookie's own Microsoft Entra user (his Microsoft 365 identity)
# Runs: locally (Azure CLI, signed in as a tenant admin). Idempotent: an existing user is kept.
# =============================================================================
# KnowAll: bookie@knowall.ai. Self-hosters: bookie@<their-domain> (AGENT_UPN in config.env).
# The password is prompted (never echoed, never stored). Set up MFA for the account on first
# sign-in and keep the TOTP seed on the VM only (~/.hermes/graph-subscriptions.env, step 21).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local
require AGENT_UPN AGENT_DISPLAY_NAME

step "Step 05: Entra user ${AGENT_UPN}"
EXISTING="$(az ad user show --id "${AGENT_UPN}" --query id -o tsv 2>/dev/null || true)"
if [ -n "${EXISTING}" ]; then
  info "exists (object id ${EXISTING}); updating department and job title only"
  az rest --method PATCH --url "https://graph.microsoft.com/v1.0/users/${AGENT_UPN}" \
    --headers "Content-Type=application/json" \
    --body "{\"department\":\"${AGENT_DEPARTMENT}\",\"jobTitle\":\"${AGENT_JOB_TITLE}\"}" -o none
  exit 0
fi

prompt_secret AGENT_PASSWORD "Initial password for ${AGENT_UPN}"
az ad user create \
  --display-name "${AGENT_DISPLAY_NAME}" \
  --user-principal-name "${AGENT_UPN}" \
  --password "${AGENT_PASSWORD}" \
  --force-change-password-next-sign-in false \
  -o none
# usageLocation is required before a licence can be assigned (step 07).
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/users/${AGENT_UPN}" \
  --headers "Content-Type=application/json" \
  --body "{\"department\":\"${AGENT_DEPARTMENT}\",\"jobTitle\":\"${AGENT_JOB_TITLE}\",\"usageLocation\":\"${USAGE_LOCATION:-GB}\"}" -o none

cat <<EOF

==> Created ${AGENT_UPN} (${AGENT_DISPLAY_NAME}, ${AGENT_JOB_TITLE}).
    Store the password in your password manager; it goes into the call-bot .env on the VM (TEAMS_PASSWORD).
Next: 06-add-to-ai-agents-group.sh, then 07-assign-license.sh
EOF
