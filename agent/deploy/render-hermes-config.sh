#!/usr/bin/env bash
# =============================================================================
# Render agent/config/hermes/config.yaml.template (default) or another Bookie template
# to stdout with config.env values. The ONE renderer: step 04 installs its output and
# `--check` compares it with the live ~/.hermes/config.yaml.
#
# Usage: render-hermes-config.sh                     # config.yaml to stdout
#        render-hermes-config.sh --soul | --persona  # SOUL.md / voice_persona.md to stdout
#        render-hermes-config.sh --check             # diff against the live config (exit 1 on drift)
# GRAPH_WEBHOOK_SECRET is read from the live ~/.hermes/.env when not exported.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [ -z "${GRAPH_WEBHOOK_SECRET:-}" ] && sudo test -f "${HERMES_DIR}/.env" 2>/dev/null; then
  GRAPH_WEBHOOK_SECRET="$(sudo sed -n "s/^GRAPH_WEBHOOK_SECRET=['\"]\{0,1\}\([^'\"]*\).*/\1/p" "${HERMES_DIR}/.env" | head -1)"
fi

PRINCIPAL_LINE=""
if [ -n "${PRINCIPAL_NAME:-}" ]; then
  PRINCIPAL_LINE="The human accountant I work with and escalate to is ${PRINCIPAL_NAME}${PRINCIPAL_UPN:+ (${PRINCIPAL_UPN})}."
fi

# Bill capture drafts purchase invoices in BC: only then does the BC MCP register write tools.
if [ -n "${ACCOUNTS_MAILBOX:-}" ]; then
  BC_TOOLS="[get_schema, list_items, get_items_by_field, create_item, update_item]"
else
  BC_TOOLS="[get_schema, list_items, get_items_by_field]"
fi

# Demo mode needs both a demo environment and company, and the environment must not be the real one.
DEMO_ON=0
if [ -n "${DEMO_BC_ENVIRONMENT:-}" ] || [ -n "${DEMO_BC_COMPANY:-}" ]; then
  [ -n "${DEMO_BC_ENVIRONMENT:-}" ] && [ -n "${DEMO_BC_COMPANY:-}" ] \
    || die "demo mode needs both DEMO_BC_ENVIRONMENT and DEMO_BC_COMPANY (or neither)"
  [ "${DEMO_BC_ENVIRONMENT}" != "${BC_ENVIRONMENT:-}" ] \
    || die "DEMO_BC_ENVIRONMENT must be a separate environment from BC_ENVIRONMENT (${BC_ENVIRONMENT}): demo mode shares figures with outsiders"
  DEMO_ON=1
  DEMO_ORG_NAME="${DEMO_ORG_NAME:-${DEMO_BC_COMPANY}}"
fi

AUTHORISED_UPNS="${AUTHORISED_UPNS:-no one yet (an administrator has not authorised anyone)}"
AUTHORISED_NAMES="${AUTHORISED_NAMES:-the people listed in my instructions}"
OWNER_NAME="${OWNER_NAME:-your administrator}"
VARS=(AGENT_NAME AGENT_DISPLAY_NAME AGENT_UPN COMPANY_NAME VM_NAME ORGANISATIONS AUTHORISED_UPNS AUTHORISED_NAMES OWNER_NAME PRINCIPAL_LINE
      MODEL_MAIN AZURE_AI_BASE_URL AI_RESOURCE_NAME TIMEZONE AGENT_REPO PRESENCE_DIR HERMES_DIR
      HERMES_WEBHOOK_PORT HERMES_API_PORT GRAPH_WEBHOOK_SECRET BC_ENVIRONMENT BC_COMPANY BC_COMPANY_2
      REVERIE_EMBEDDINGS BC_TOOLS DEMO_BC_ENVIRONMENT DEMO_BC_COMPANY DEMO_ORG_NAME)

# Keep or drop a "# >>> name" ... "# <<< name" block (YAML) or "<!-- >>> name -->" block (Markdown).
block() { # block NAME KEEP(0|1)
  if [ "$2" = 1 ]; then sed -E "/(# |<!-- )(>>>|<<<) $1( -->)?\$/d"
  else sed -E "/(# |<!-- )>>> $1( -->)?\$/,/(# |<!-- )<<< $1( -->)?\$/d"; fi
}

case "${1:-}" in
  --soul)    render_template "${AGENT_DIR}/hermes/SOUL.md" "${VARS[@]}" | block demo-mode "${DEMO_ON}"; exit 0 ;;
  --persona) render_template "${AGENT_DIR}/hermes/voice_persona.md" "${VARS[@]}" | block demo-mode "${DEMO_ON}"; exit 0 ;;
esac

render_config() {
  local out
  out="$(render_template "${AGENT_DIR}/config/hermes/config.yaml.template" "${VARS[@]}")"
  if [ -z "${BC_COMPANY_2:-}" ]; then
    out="$(printf '%s\n' "${out}" | sed '/# >>> bc-company-2/,/# <<< bc-company-2/d')"
  fi
  printf '%s\n' "${out}" | block bc-demo "${DEMO_ON}"
}

if [ "${1:-}" = "--check" ]; then
  if ! sudo test -f "${HERMES_DIR}/config.yaml"; then echo "config drift: no live config yet"; exit 0; fi
  # The route secret is masked on both sides so a drift report never prints it.
  mask() { sed -E 's/^([[:space:]]*secret:).*/\1 "<masked>"/'; }
  if diff -u <(sudo cat "${HERMES_DIR}/config.yaml" | mask) <(render_config | mask) >&2; then
    echo "config drift: none"
  else
    echo "config drift: the live config differs from the template (diff above; - live, + template)"
    exit 1
  fi
  exit 0
fi

render_config
