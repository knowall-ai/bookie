#!/usr/bin/env bash
# =============================================================================
# Step 04: install and configure Hermes Agent for Bookie (systemd hermes-gateway-<agent>)
# Runs: ON the VM as the admin user. Idempotent; safe to re-run after a git pull.
# =============================================================================
# 1. Hermes (official installer, as the agent user) and the Bookie repo checkout.
# 2. ~/.hermes/.env: generated route/API secrets and the Azure OpenAI key (prompted, never echoed).
#    Lines other steps own (BC_*, NEO4J_*, APPLICATIONINSIGHTS_*) are left alone.
# 3. ~/.hermes/config.yaml from the template; refuses to overwrite a live file that has drifted
#    unless FORCE_CONFIG=1 (a backup is always kept). SOUL.md and voice_persona.md rendered.
# 4. Marketplace clone(s) + de-duplicated skill farm + skill-name check.
# 5. systemd unit, scheduled jobs (month-end review, bill-capture gate).
# Prerequisite for a working brain: step 13 (Azure OpenAI resource + gpt-6.1-sol deployment).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
require AGENT_NAME AGENT_UPN AGENT_REPO_URL AGENT_REPO HERMES_DIR MODEL_MAIN AZURE_AI_BASE_URL

AGENT_HOME="/home/${AGENT_NAME}"
ENV_FILE="${HERMES_DIR}/.env"

step "Step 04: Hermes for '${AGENT_NAME}'"
if as_agent 'command -v hermes >/dev/null'; then
  info "Hermes already installed: $(as_agent 'hermes --version' 2>/dev/null | head -1)"
else
  info "installing from ${HERMES_INSTALL_URL}"
  as_agent "curl -fsSL '${HERMES_INSTALL_URL}' | bash"
fi
as_agent 'hermes --version' >/dev/null || die "hermes did not install"
as_agent 'mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global'

step "Repo checkout ${AGENT_REPO} (${AGENT_REPO_REF})"
if sudo test -d "${AGENT_REPO}/.git"; then
  if [ -n "$(as_agent "git -C '${AGENT_REPO}' status --porcelain")" ]; then
    warn "${AGENT_REPO} has local changes; not updating it"
  else
    as_agent "git -C '${AGENT_REPO}' fetch --quiet origin && git -C '${AGENT_REPO}' checkout --quiet '${AGENT_REPO_REF}' && git -C '${AGENT_REPO}' merge --ff-only --quiet 'origin/${AGENT_REPO_REF}'" \
      || warn "could not fast-forward ${AGENT_REPO}; left as is"
  fi
else
  as_agent "git clone --quiet --branch '${AGENT_REPO_REF}' '${AGENT_REPO_URL}' '${AGENT_REPO}'"
fi
as_agent "mkdir -p '${HERMES_DIR}' '${HERMES_DIR}/scripts' '${AGENT_HOME}/tmp/browser' '${AGENT_HOME}/call-transcripts'"

step "Secrets in ${ENV_FILE} (values are never printed)"
sudo test -f "${ENV_FILE}" || echo -n | install_text "${ENV_FILE}" 600 "${AGENT_NAME}"
for v in GRAPH_WEBHOOK_SECRET API_SERVER_KEY; do
  if env_has "${ENV_FILE}" "${v}"; then
    info "${v}: kept"
  else
    set_env_line "${ENV_FILE}" "${v}" "${!v:-$(openssl rand -hex 32)}"
    info "${v}: generated"
  fi
done
if env_has "${ENV_FILE}" AZURE_FOUNDRY_API_KEY; then
  info "AZURE_FOUNDRY_API_KEY: kept"
else
  if [ -z "${AZURE_FOUNDRY_API_KEY:-}" ]; then
    echo "    Paste the key of ${AI_RESOURCE_NAME} (az cognitiveservices account keys list -g ${AI_RESOURCE_GROUP} -n ${AI_RESOURCE_NAME} --query key1 -o tsv)."
    prompt_secret AZURE_FOUNDRY_API_KEY "AZURE_FOUNDRY_API_KEY"
  fi
  set_env_line "${ENV_FILE}" AZURE_FOUNDRY_API_KEY "${AZURE_FOUNDRY_API_KEY}"
  info "AZURE_FOUNDRY_API_KEY: set"
fi
# Non-secret settings: always rewritten from config.env.
declare -A SETTINGS=(
  [API_SERVER_ENABLED]=true [API_SERVER_HOST]=127.0.0.1 [API_SERVER_PORT]="${HERMES_API_PORT}"
  [HERMES_WEBHOOK_URL]="http://127.0.0.1:${HERMES_WEBHOOK_PORT}"
  [AGENT_NAME]="${AGENT_NAME}" [AGENT_DISPLAY_NAME]="${AGENT_DISPLAY_NAME}" [AGENT_EMAIL]="${AGENT_UPN}"
  [PRESENCE_STATE_DIR]="${HERMES_DIR}" [PRESENCE_DIR]="${PRESENCE_DIR}" [AGENT_REPO]="${AGENT_REPO}"
  [AGENT_WORKSPACE]="${HERMES_DIR}" [COMPANY_NAME]="${COMPANY_NAME}" [BC_COMPANY]="${BC_COMPANY}"
  [BC_ENVIRONMENT]="${BC_ENVIRONMENT}" [BROWSER_OUT_DIR]="${AGENT_HOME}/tmp/browser"
  [GRAPH_DEFAULT_AUTH]=delegated [INTERNAL_DOMAINS]="${M365_DOMAIN}" [XERO_SH]="${XERO_SH}"
  [XERO_SCOPE]="accounting.transactions.read accounting.reports.read accounting.contacts.read accounting.settings.read"
  [ACCOUNTS_MAILBOX]="${ACCOUNTS_MAILBOX:-}" [PORTAL_BASE_URL]="${PORTAL_BASE_URL:-https://bookie.knowall.ai/portal}"
  [BILL_CAPTURE_PROCESSED_FOLDER]="${BILL_CAPTURE_PROCESSED_FOLDER:-Bookie/Processed}"
  [BILL_CAPTURE_REVIEW_FOLDER]="${BILL_CAPTURE_REVIEW_FOLDER:-Bookie/Needs review}"
  [PRINCIPAL_UPN]="${PRINCIPAL_UPN:-}" [HUD_BRAIN_MODEL]="${MODEL_MAIN}" [DEEP_FEED_PROVIDER]=hermes
  [BILL_CAPTURE_TEAMS_TARGET]="${BILL_CAPTURE_TEAMS_TARGET:-}" [BILL_CAPTURE_LOG]="${BILL_CAPTURE_LOG:-teams}"
  [BILL_CAPTURE_LOG_SITE]="${BILL_CAPTURE_LOG_SITE:-}" [BILL_CAPTURE_LOG_LIST]="${BILL_CAPTURE_LOG_LIST:-Bookie capture log}"
  [BILL_PO_CHECK]="${BILL_PO_CHECK:-auto}" [BILL_APPROVE_IN_TEAMS]="${BILL_APPROVE_IN_TEAMS:-false}"
  [BILL_APPROVERS]="${BILL_APPROVERS:-}"
  [BC_COMPANIES]="${BC_COMPANY}${BC_COMPANY_2:+;${BC_COMPANY_2}}" [XERO_COMPANIES]="${XERO_COMPANIES}"
  [ORGANISATIONS]="${ORGANISATIONS}"
  [BOOKIE_ELECTRUM_URL]="${BOOKIE_ELECTRUM_URL:-}"
  [BOOKIE_ELECTRUM_CERT_SHA256]="${BOOKIE_ELECTRUM_CERT_SHA256:-}"
  [BTC_WALLET]="${AGENT_REPO}/agent/hermes/scripts/btc-wallet.mjs"
)
for k in "${!SETTINGS[@]}"; do set_env_line "${ENV_FILE}" "${k}" "${SETTINGS[${k}]}"; done
info "settings written: ${#SETTINGS[@]}"

step "config.yaml, SOUL.md and voice_persona.md"
if sudo test -f "${HERMES_DIR}/config.yaml"; then
  if ! bash "${SCRIPT_DIR}/render-hermes-config.sh" --check; then
    [ "${FORCE_CONFIG:-0}" = 1 ] || die "live config.yaml has drifted (diff above). Move live-only settings into agent/config/hermes/config.yaml.template, or FORCE_CONFIG=1 to overwrite (a backup is kept)."
  fi
  sudo cp -p "${HERMES_DIR}/config.yaml" "${HERMES_DIR}/config.yaml.bak-deploy-$(date +%Y%m%d%H%M%S)"
fi
tmp="$(mktemp)"
bash "${SCRIPT_DIR}/render-hermes-config.sh" > "${tmp}" && [ -s "${tmp}" ] || { rm -f "${tmp}"; die "render failed; live config untouched"; }
python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' "${tmp}" || { rm -f "${tmp}"; die "rendered config.yaml is not valid YAML"; }
sudo install -o "${AGENT_NAME}" -g "${AGENT_NAME}" -m 600 "${tmp}" "${HERMES_DIR}/config.yaml"; rm -f "${tmp}"
bash "${SCRIPT_DIR}/render-hermes-config.sh" --soul    | install_text "${HERMES_DIR}/SOUL.md" 644 "${AGENT_NAME}"
# The brain is Bookie's ChatGPT Business seat (provider openai-codex). It needs a one-off device-code
# sign-in per VM; until then every turn falls back to the metered Azure deployment.
as_agent "hermes auth list" 2>/dev/null | grep -q "^openai-codex" \
  || warn "no ChatGPT sign-in yet: run  sudo -u ${AGENT_NAME} -i hermes auth add openai-codex  and approve the code as bookie@ in a browser (until then Bookie runs on the Azure fallback, billed per token)"
bash "${SCRIPT_DIR}/render-hermes-config.sh" --persona | install_text "${HERMES_DIR}/voice_persona.md" 644 "${AGENT_NAME}"
info "installed (config.yaml mode 600: it holds the webhook route secret)"

step "Marketplace packs and the de-duplicated skill farm"
as_agent "mkdir -p '${SKILLS_SYNC_ROOT}'"
for entry in ${MARKETPLACE_REPOS}; do
  pack="${entry%%=*}"; url="${entry#*=}"
  if sudo test -d "${SKILLS_SYNC_ROOT}/${pack}/.git"; then
    info "${pack}: present (kept current by step 33)"
  else
    as_agent "git clone --quiet '${url}' '${SKILLS_SYNC_ROOT}/${pack}'" \
      || warn "${pack}: clone of ${url} failed (private repo? add a read-only deploy key for ${AGENT_NAME}); the xero/business-central skills are missing until it is cloned"
  fi
done
as_agent "PRESENCE_DIR='${PRESENCE_DIR}' MARKETPLACE_ROOT='${SKILLS_SYNC_ROOT}' FARM_ROOT='${HERMES_DIR}/marketplace-skills' PACKS='${SKILL_PACKS}' bash '${AGENT_REPO}/agent/hermes/scripts/link-marketplace-skills.sh'"
as_agent "PRESENCE_DIR='${PRESENCE_DIR}' bash '${AGENT_REPO}/agent/hermes/scripts/check-skill-names.sh'"
sudo test -x "${XERO_SH}" || warn "xero.sh not found at ${XERO_SH}; the books skill cannot read Xero until the knowall-ai pack is cloned"

step "systemd unit hermes-gateway-${AGENT_NAME}"
render_template "${AGENT_DIR}/config/systemd/hermes-gateway.service" AGENT_NAME AGENT_DISPLAY_NAME HERMES_DIR \
  | sudo tee "/etc/systemd/system/hermes-gateway-${AGENT_NAME}.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "hermes-gateway-${AGENT_NAME}" >/dev/null
info "enabled (start it after steps 40 and 41 so memory and the books are there)"

step "Scheduled jobs (hermes cron; names are not unique, so create only when absent)"
cron_absent() { ! as_agent "hermes cron list" 2>/dev/null | grep -qE "Name:[[:space:]]+$1\$"; }
if [ -n "${MONTH_END_CRON:-}" ] && cron_absent month-end-review; then
  as_agent "hermes cron create --name month-end-review --deliver local --skill month-end-review --skill books '${MONTH_END_CRON}' 'Run the month-end-review skill for last month for every organisation and send the report to ${PRINCIPAL_UPN:-the accountant} by Teams.'" \
    || warn "could not create the month-end-review cron job"
fi
# With an Electrum server configured, the weekly reconcile also reconciles the Bitcoin wallets (skill: bitcoin).
BTC_RECONCILE_SKILL="" BTC_RECONCILE_TEXT=""
if [ -n "${BOOKIE_ELECTRUM_URL:-}" ]; then
  BTC_RECONCILE_SKILL="--skill bitcoin"
  BTC_RECONCILE_TEXT=" Then run the reconcile command of the bitcoin skill (read-only) for each Business Central organisation and add a Bitcoin section: its counts line, then only what needs attention."
fi
if [ -n "${RECONCILE_CRON:-}" ] && [ -n "${ACCOUNTS_MAILBOX:-}" ] && [ -n "${RECONCILE_TO:-}" ] && cron_absent weekly-reconcile; then
  as_agent "hermes cron create --name weekly-reconcile --deliver local --skill bill-capture --skill books ${BTC_RECONCILE_SKILL} '${RECONCILE_CRON}' 'Scheduled weekly reconcile, set up by the operator. Run bill-capture RECONCILE mode (read-only: nothing created, attached, moved or logged) for the last 7 days of invoice emails in ${ACCOUNTS_MAILBOX}, including step 0 (is it genuine?).${BTC_RECONCILE_TEXT} Send the report by Teams 1:1 chat to ${RECONCILE_TO}, starting with: Weekly reconcile. Lead with the counts line, then only the items that need attention (not in the books, different, no document, suspicious).'" \
    || warn "could not create the weekly-reconcile cron job"
fi
if [ -n "${ACCOUNTS_MAILBOX:-}" ]; then
  # Hermes only runs cron scripts that live in ~/.hermes/scripts, so the gate is copied, not linked.
  sudo install -o "${AGENT_NAME}" -g "${AGENT_NAME}" -m 755 "${AGENT_DIR}/hermes/scripts/accounts-inbox-gate.sh" "${HERMES_DIR}/scripts/accounts-inbox-gate.sh"
  if cron_absent bill-capture; then
    as_agent "hermes cron create --name bill-capture --deliver local --skill bill-capture --skill books --script accounts-inbox-gate.sh '${BILL_CAPTURE_CRON}' 'New mail arrived at ${ACCOUNTS_MAILBOX}: the message ids are in the script output above. Process each one with the bill-capture skill.'" \
      || warn "could not create the bill-capture cron job"
    # Automatic capture drafts bills in the live books, so it starts PAUSED. A person turns it on
    # (BILL_CAPTURE_AUTO=1 here, or `hermes cron resume <id>`) once previews look right.
    if [ "${BILL_CAPTURE_AUTO:-0}" != 1 ]; then
      BC_ID="$(as_agent "hermes cron list" 2>/dev/null | grep -B2 -E 'Name:[[:space:]]+bill-capture$' | grep -oE '^ *[0-9a-f]{12}' | tr -d ' ')"
      [ -n "${BC_ID}" ] && as_agent "hermes cron pause ${BC_ID}" >/dev/null && info "bill-capture created PAUSED (BILL_CAPTURE_AUTO=1 to start it running)"
    fi
  fi
fi
as_agent "hermes cron list" 2>/dev/null | grep -E "Name:|Schedule:" || true

cat <<EOF

==> Step 04 done. Remaining by hand, as the agent user:
    sudo -u ${AGENT_NAME} -i hermes model          # confirm provider azure-foundry / ${MODEL_MAIN} (VERIFY api_mode)
    sudo -u ${AGENT_NAME} -i hermes config show    # confirm mcp_servers, plugins, skills.external_dirs
Start once steps 40 (Reverie) and 41 (BC) are done:
    sudo systemctl start hermes-gateway-${AGENT_NAME}
    curl -s http://127.0.0.1:${HERMES_WEBHOOK_PORT}/health
EOF
