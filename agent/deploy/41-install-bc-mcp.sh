#!/usr/bin/env bash
# =============================================================================
# Step 41: Business Central for Bookie: a service-to-service Entra app + the BC MCP server
#   ./41-install-bc-mcp.sh --local                 # workstation, tenant admin: app + BC permission + consent
#   ./41-install-bc-mcp.sh --local --push-secret   # ...and create a client secret, piped straight to the VM
#   ./41-install-bc-mcp.sh --vm [--secret-stdin]   # on the VM: install the MCP server, write BC_* to .env
# Idempotent. The secret is never printed, never written on the workstation.
# =============================================================================
# Bookie signs in to BC as an APPLICATION (OAuth client_credentials), not as a person: an unattended
# agent must not depend on someone's `az login`. BC turns the app into an application user that needs
# no licence. HUMAN STEPS IN THE BC UI (once per environment, by a BC admin), after --local:
#   1. Business Central > search "Microsoft Entra Applications" > New.
#   2. Client ID = the app id printed by --local; Description "BOOKIE AI BOOKKEEPER"; State = Enabled.
#      (BC shows "A user named ... will be created".)
#   3. User Permission Sets, Company blank (all companies) or one line per company:
#        D365 READ                 always: read everything Bookie answers questions about
#        D365 PURCH DOC, EDIT      only with bill capture: draft purchase invoices (no posting)
#        D365 VENDOR, EDIT         only with bill capture: create a vendor after a human "approve"
#      Never D365 BUS FULL ACCESS, SUPER, or any POST/approval set.
#   4. Grant Consent (sign in as a Global/Application admin), then check the user appears in Users.
#   5. Repeat in Sandbox if you want Bookie there too.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
MODE="${1:-}"; FLAG="${2:-}"

BC_API="996def3d-b36c-4153-8607-a6fd3c01b89f"   # Dynamics 365 Business Central (Microsoft first-party app id, public)

local_mode() {
  must_run_on local
  require BC_APP_NAME
  step "Step 41 (local): Entra app '${BC_APP_NAME}' (client_credentials, single tenant)"
  APP_ID="$(az ad app list --display-name "${BC_APP_NAME}" --query '[0].appId' -o tsv)"
  if [ -z "${APP_ID}" ]; then
    APP_ID="$(az ad app create --display-name "${BC_APP_NAME}" --sign-in-audience AzureADMyOrg --query appId -o tsv)"
    info "created ${APP_ID}"
  else
    info "exists ${APP_ID}"
  fi
  az ad sp show --id "${APP_ID}" -o none 2>/dev/null || az ad sp create --id "${APP_ID}" -o none

  # API.ReadWrite.All is the BC application role for the v2.0 APIs. What Bookie may actually do is
  # decided by the BC permission sets on the app's BC user (steps 3 above), not by this role.
  ROLE="$(az ad sp show --id "${BC_API}" --query "appRoles[?value=='API.ReadWrite.All'].id | [0]" -o tsv)"
  [ -n "${ROLE}" ] || die "Business Central service principal not found in this tenant (is BC provisioned?)"
  if az ad app permission list --id "${APP_ID}" --query "[?resourceAppId=='${BC_API}'].resourceAccess[].id" -o tsv | grep -qx "${ROLE}"; then
    info "API.ReadWrite.All (application): present"
  else
    az ad app permission add --id "${APP_ID}" --api "${BC_API}" --api-permissions "${ROLE}=Role" -o none 2>/dev/null
    info "API.ReadWrite.All (application): added"
  fi
  az ad app permission admin-consent --id "${APP_ID}"
  info "admin consent granted"

  if [ "${FLAG}" = "--push-secret" ]; then
    require PUBLIC_DOMAIN VM_ADMIN_USER
    step "New client secret (1 year), piped to the VM without being shown"
    az ad app credential reset --id "${APP_ID}" --append --display-name "bookie-vm-$(date +%Y%m%d)" --years 1 \
      --query password -o tsv \
      | ssh "${VM_ADMIN_USER}@${PUBLIC_DOMAIN}" "BC_CLIENT_ID='${APP_ID}' BC_TENANT_ID='$(az account show --query tenantId -o tsv)' bash ~/bookie/agent/deploy/41-install-bc-mcp.sh --vm --secret-stdin"
    warn "diary the secret expiry (1 year); re-run --local --push-secret before then"
  fi
  cat <<EOF

==> Step 41 (local) done. App (client) id: ${APP_ID}
    Now the BC admin steps in the header (Microsoft Entra Applications card, permission sets, Grant Consent).
    Then, if you did not use --push-secret: on the VM
      export BC_CLIENT_ID=${APP_ID} BC_TENANT_ID=$(az account show --query tenantId -o tsv)
      ./41-install-bc-mcp.sh --vm          # prompts for the secret (create it in Entra > Certificates & secrets)
EOF
}

vm_mode() {
  must_run_on vm
  require BC_MCP_PACKAGE BC_ENVIRONMENT BC_COMPANY
  local ENV_FILE="${HERMES_DIR}/.env" SECRET TOKEN COUNT
  step "Step 41 (vm): ${BC_MCP_PACKAGE}"
  as_agent "npm install -g --silent '${BC_MCP_PACKAGE}'"
  as_agent "command -v mcp-business-central" >/dev/null || die "mcp-business-central not on the agent's PATH"

  for v in BC_TENANT_ID BC_CLIENT_ID; do
    if [ -n "${!v:-}" ]; then set_env_line "${ENV_FILE}" "${v}" "${!v}"; info "${v}: set"
    elif env_has "${ENV_FILE}" "${v}"; then info "${v}: kept"
    else die "${v} not set: export the value --local printed"; fi
  done
  if [ "${FLAG}" = "--secret-stdin" ]; then
    IFS= read -r SECRET || true
    [ -n "${SECRET}" ] || die "no secret on stdin"
    set_env_line "${ENV_FILE}" BC_CLIENT_SECRET "${SECRET}"; info "BC_CLIENT_SECRET: set from stdin"
  elif env_has "${ENV_FILE}" BC_CLIENT_SECRET; then
    info "BC_CLIENT_SECRET: kept"
  else
    prompt_secret SECRET "BC client secret for ${BC_CLIENT_ID:-the app}"
    set_env_line "${ENV_FILE}" BC_CLIENT_SECRET "${SECRET}"; info "BC_CLIENT_SECRET: set"
  fi
  set_env_line "${ENV_FILE}" BC_ENVIRONMENT "${BC_ENVIRONMENT}"

  step "Smoke test: token + company list (prints a count, never data)"
  # Runs as the agent user, reading the secret from .env inside that shell (never on a command line).
  COUNT="$(as_agent "set -a; source '${ENV_FILE}'; set +a
    t=\$(curl -s -X POST \"https://login.microsoftonline.com/\${BC_TENANT_ID}/oauth2/v2.0/token\" \
         --data-urlencode grant_type=client_credentials --data-urlencode client_id=\"\${BC_CLIENT_ID}\" \
         --data-urlencode client_secret=\"\${BC_CLIENT_SECRET}\" \
         --data-urlencode scope=https://api.businesscentral.dynamics.com/.default \
         | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"access_token\",\"\"))')
    [ -n \"\$t\" ] || { echo TOKEN_FAILED; exit 0; }
    curl -s -H \"Authorization: Bearer \$t\" \"https://api.businesscentral.dynamics.com/v2.0/\${BC_TENANT_ID}/${BC_ENVIRONMENT}/api/v2.0/companies\" \
      | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(len(d[\"value\"]) if \"value\" in d else \"ERROR \" + str(d.get(\"error\",{}).get(\"code\",\"?\")))'" 2>/dev/null || echo FAILED)"
  case "${COUNT}" in
    TOKEN_FAILED) warn "no token: check the app id, secret and admin consent" ;;
    ERROR*|FAILED|"") warn "BC refused (${COUNT}): finish the Microsoft Entra Applications card and Grant Consent in BC" ;;
    *) info "BC answered: ${COUNT} companies visible" ;;
  esac
  echo "Re-run 04-configure-hermes.sh if BC_COMPANY/BC_COMPANY_2 changed, then restart hermes-gateway-${AGENT_NAME} (safe-deploy.sh)."
}

case "${MODE}" in
  --local) local_mode ;;
  --vm)    vm_mode ;;
  *) die "usage: $0 --local [--push-secret] | --vm [--secret-stdin]" ;;
esac
