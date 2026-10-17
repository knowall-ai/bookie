#!/usr/bin/env bash
# =============================================================================
# Step 31: activity telemetry (agent-pulse) for the Agents Portal
#   ./31-setup-telemetry.sh --azure   # workstation: Log Analytics log-<agent> + App Insights appi-<agent>
#   ./31-setup-telemetry.sh --vm      # on the VM: install the agent-pulse Hermes plugin + settings
# Idempotent in both modes. Adapted from poppie-hermes deploy/31 and 32.
# =============================================================================
# The portal finds an agent's workspace by its `agent` tag, so both resources carry agent=<AGENT_ID>
# (and the VM's agent-customer tag). A resource tagged for another agent is never taken over.
# The connection string is NEVER printed: on the VM it is fetched straight into ~/.hermes/.env.
# The Hermes plugin lives in poppie-hermes today (AGENT_PULSE_PLUGIN_REPO/_PATH/_REF); it is fetched
# at a pinned ref until it moves into knowall-ai/agent-pulse. Its event mapping was written for
# Poppie's commands (Teams answers, emails, DevOps); Bookie's Teams answers and emails are recorded
# the same way, and a books-specific mapping is an open item (agent/README.md).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
AGENT_ID="${AGENT_ID:-${AGENT_NAME}}"
WORKSPACE="${TELEMETRY_WORKSPACE:-log-${AGENT_ID}}"
APPI="${TELEMETRY_APPI:-appi-${AGENT_ID}}"

azure_mode() {
  must_run_on local
  local LOCATION="${TELEMETRY_LOCATION:-${VM_LOCATION}}" CUSTOMER TAGS owner WSID LINKED
  az extension add --name application-insights --only-show-errors >/dev/null 2>&1 || true
  CUSTOMER="$(az vm show -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --query 'tags."agent-customer"' -o tsv 2>/dev/null || true)"
  TAGS=("agent=${AGENT_ID}"); [ -n "${CUSTOMER}" ] && TAGS+=("agent-customer=${CUSTOMER}")
  check_owner() {
    owner="$(az resource show -g "${RESOURCE_GROUP}" -n "$1" --resource-type "$2" --query tags.agent -o tsv 2>/dev/null || true)"
    [ -z "${owner}" ] || [ "${owner}" = "${AGENT_ID}" ] || die "$1 is tagged agent=${owner}; set TELEMETRY_WORKSPACE/TELEMETRY_APPI"
  }
  step "Step 31 (azure): ${WORKSPACE} + ${APPI} in ${RESOURCE_GROUP}"
  if az monitor log-analytics workspace show -g "${RESOURCE_GROUP}" -n "${WORKSPACE}" -o none 2>/dev/null; then
    check_owner "${WORKSPACE}" Microsoft.OperationalInsights/workspaces
    az resource tag --is-incremental -g "${RESOURCE_GROUP}" -n "${WORKSPACE}" --resource-type Microsoft.OperationalInsights/workspaces --tags "${TAGS[@]}" -o none
    info "workspace exists"
  else
    az monitor log-analytics workspace create -g "${RESOURCE_GROUP}" -n "${WORKSPACE}" --location "${LOCATION}" --retention-time 30 --tags "${TAGS[@]}" -o none
    info "workspace created (30-day retention)"
  fi
  WSID="$(az monitor log-analytics workspace show -g "${RESOURCE_GROUP}" -n "${WORKSPACE}" --query id -o tsv)"
  if az monitor app-insights component show -g "${RESOURCE_GROUP}" --app "${APPI}" -o none 2>/dev/null; then
    check_owner "${APPI}" Microsoft.Insights/components
    LINKED="$(az monitor app-insights component show -g "${RESOURCE_GROUP}" --app "${APPI}" --query workspaceResourceId -o tsv)"
    [ "${LINKED,,}" = "${WSID,,}" ] || die "${APPI} sends to '${LINKED:-classic}', not ${WSID}; fix the link by hand"
    az resource tag --is-incremental -g "${RESOURCE_GROUP}" -n "${APPI}" --resource-type Microsoft.Insights/components --tags "${TAGS[@]}" -o none
    info "app insights exists"
  else
    az monitor app-insights component create -g "${RESOURCE_GROUP}" --app "${APPI}" --location "${LOCATION}" \
      --kind other --application-type other --workspace "${WSID}" --tags "${TAGS[@]}" -o none
    info "app insights created"
  fi
  echo "Next, on the VM: az login (or use the VM identity with Reader on ${APPI}), then ./31-setup-telemetry.sh --vm"
}

vm_mode() {
  must_run_on vm
  local SRC DEST HERMES_PY CS
  step "Step 31 (vm): agent-pulse plugin @ ${AGENT_PULSE_PLUGIN_REF}"
  SRC="$(mktemp -d)"
  git -C "${SRC}" init -q
  git -C "${SRC}" remote add origin "${AGENT_PULSE_PLUGIN_REPO}"
  git -C "${SRC}" fetch -q --depth 1 origin "${AGENT_PULSE_PLUGIN_REF}" || die "cannot fetch ${AGENT_PULSE_PLUGIN_REPO}@${AGENT_PULSE_PLUGIN_REF}"
  git -C "${SRC}" checkout -q FETCH_HEAD -- "${AGENT_PULSE_PLUGIN_PATH}"
  DEST="${HERMES_DIR}/plugins/agent-pulse"
  sudo mkdir -p "${DEST}"
  sudo rsync -a --delete --exclude '__pycache__' "${SRC}/${AGENT_PULSE_PLUGIN_PATH}/" "${DEST}/"
  sudo chown -R "${AGENT_NAME}:${AGENT_NAME}" "${HERMES_DIR}/plugins"
  rm -rf "${SRC}"
  HERMES_PY="$(as_agent 'p="$(readlink -f "$(command -v hermes)")"; d="$(dirname "$p")"; [ -x "$d/python" ] && echo "$d/python" || sed -n "1s/^#!//p" "$p"' || true)"
  [ -x "${HERMES_PY:-}" ] || HERMES_PY="${HERMES_DIR}/hermes-agent/venv/bin/python"
  [ -x "${HERMES_PY}" ] || die "cannot find Hermes' Python"
  if as_agent "command -v uv" >/dev/null 2>&1; then
    as_agent "uv pip install --quiet --python '${HERMES_PY}' -r '${DEST}/requirements.txt'"
  else
    as_agent "'${HERMES_PY}' -m pip install --quiet -r '${DEST}/requirements.txt'"
  fi
  as_agent "'${HERMES_PY}' -c 'import agent_pulse'" && info "agent_pulse imports"

  CS="${APPLICATIONINSIGHTS_CONNECTION_STRING:-}"
  if [ -z "${CS}" ] && command -v az >/dev/null && az account show -o none 2>/dev/null; then
    CS="$(az monitor app-insights component show -g "${RESOURCE_GROUP}" --app "${APPI}" --query connectionString -o tsv 2>/dev/null || true)"
  fi
  set_env_line "${HERMES_DIR}/.env" APPLICATIONINSIGHTS_CONNECTION_STRING "${CS}"
  set_env_line "${HERMES_DIR}/.env" AGENT_ID "${AGENT_ID}"
  if [ -n "${CS}" ]; then info "connection string written to ${HERMES_DIR}/.env (not shown)"
  else warn "no connection string: the plugin is installed but inert"; fi
  echo "Restart the gateway when no call is live: ./safe-deploy.sh 'sudo systemctl restart hermes-gateway-${AGENT_NAME}'"
}

case "${1:-}" in
  --azure) azure_mode ;;
  --vm)    vm_mode ;;
  *) die "usage: $0 --azure | --vm" ;;
esac
