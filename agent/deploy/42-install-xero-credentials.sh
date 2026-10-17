#!/usr/bin/env bash
# =============================================================================
# Step 42: Xero credentials for Bookie (one Custom Connection per Xero organisation)
# Runs: ON the VM as the admin user, interactively. Idempotent: existing files are kept unless
#   FORCE=1. Keys are read without echo, written chmod 600 as the agent user, never printed.
#   ./42-install-xero-credentials.sh            # every company in XERO_COMPANIES
#   ./42-install-xero-credentials.sh uk         # one company key
# =============================================================================
# HUMAN STEPS FIRST (developer.xero.com, by someone who can authorise the organisation):
#   1. My Apps > New app > "Custom connection"; name it "Bookie AI bookkeeper".
#   2. Scopes, read-only by default:
#        accounting.settings.read accounting.contacts.read accounting.transactions.read
#        accounting.reports.read
#      With bill capture (ACCOUNTS_MAILBOX set) add the write scopes it needs, and nothing else:
#        accounting.transactions accounting.attachments accounting.contacts
#      (VERIFY against Xero's current scope list: Xero is moving to granular scopes such as
#       accounting.invoices; pick the narrowest ones that cover bills and attachments.)
#   3. Select the authorising user; they receive an email and connect the ONE organisation.
#      Custom Connections are 1:1 with an organisation, are a paid Xero subscription per org, and
#      are offered for AU/NZ/UK/US organisations only. Other regions need a standard OAuth 2.0
#      (auth code) app instead; xero.sh would then need a refresh-token flow (open item).
#   4. Configuration > copy the Client ID and generate the Client secret (shown once).
# The files match what the knowall-ai xero skill's xero.sh reads:
#   uk -> ~/.config/xero/credentials      other keys -> ~/.config/xero/credentials.<key>
# Xero's developer terms: data from the API must never be used to train or fine-tune AI models.
# Bookie reads it live per question and never stores it (SOUL.md rule 4).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
[ -t 0 ] || die "this step prompts for keys: run it in an interactive terminal"

COMPANIES="${1:-${XERO_COMPANIES}}"
CRED_DIR="/home/${AGENT_NAME}/.config/xero"
as_agent "mkdir -p '${CRED_DIR}' && chmod 700 '${CRED_DIR}' ~/.config"

for key in ${COMPANIES}; do
  [[ "${key}" =~ ^[a-z0-9]+$ ]] || die "company key '${key}' must be lowercase letters/digits"
  if [ "${key}" = "uk" ]; then FILE="${CRED_DIR}/credentials"; else FILE="${CRED_DIR}/credentials.${key}"; fi
  step "Step 42: Xero company '${key}' -> ${FILE}"
  if sudo test -s "${FILE}" && [ "${FORCE:-0}" != 1 ]; then
    info "exists; kept (FORCE=1 to replace)"
    continue
  fi
  unset XERO_CLIENT_ID XERO_CLIENT_SECRET
  read -r -p "    Client ID for '${key}': " XERO_CLIENT_ID
  [[ "${XERO_CLIENT_ID}" =~ ^[A-Za-z0-9]+$ ]] || die "that does not look like a Xero client id"
  prompt_secret XERO_CLIENT_SECRET "    Client secret for '${key}' (not shown)"
  case "${XERO_CLIENT_SECRET}" in *"'"*|*$'\n'*) die "unexpected character in the secret" ;; esac
  printf "XERO_CLIENT_ID='%s'\nXERO_CLIENT_SECRET='%s'\n" "${XERO_CLIENT_ID}" "${XERO_CLIENT_SECRET}" \
    | install_text "${FILE}" 600 "${AGENT_NAME}"
  unset XERO_CLIENT_SECRET
  # The token/tenant cache of the old credentials must not outlive them.
  as_agent "rm -rf ~/.cache/xero/${key}"
  info "written (mode 600, owner ${AGENT_NAME})"

  step "Smoke test for '${key}' (organisation count only)"
  if sudo test -x "${XERO_SH}"; then
    RESULT="$(as_agent "XERO_COMPANY='${key}' XERO_SCOPE='accounting.settings.read' '${XERO_SH}' GET Organisation 2>/dev/null \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d.get(\"Organisations\", [])))'" 2>/dev/null || echo FAILED)"
    if [ "${RESULT}" = "1" ]; then info "Xero answered: 1 organisation connected"
    else warn "Xero smoke test failed (${RESULT}): check the scopes and that the organisation was connected"; fi
  else
    warn "xero.sh not found at ${XERO_SH}; smoke test skipped (clone the knowall-ai pack: step 04)"
  fi
done
echo "Done. Bookie reads Xero with XERO_SCOPE from ~/.hermes/.env (read-only scopes by default)."
