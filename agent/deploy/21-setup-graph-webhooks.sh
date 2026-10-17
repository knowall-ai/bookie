#!/usr/bin/env bash
# =============================================================================
# Step 21: Microsoft Graph wiring: Bookie's Graph app, the Presence Graph adapter, subscriptions,
#          and the accounts@ mailbox wake for bill capture.
#   ./21-setup-graph-webhooks.sh --local   # workstation (az, tenant admin): app registration + consent
#   ./21-setup-graph-webhooks.sh --vm      # on the VM: env files, adapter + renewal units, sign-in
# Idempotent in both modes. Run --vm AFTER step 23 (it renders units from ~/presence/config).
# =============================================================================
# Bookie talks to Microsoft 365 as himself (DELEGATED auth, GRAPH_DEFAULT_AUTH=delegated): Teams
# chats, his own mail and calendar, and the shared accounts mailbox through FullAccess (step 10).
# The app registration therefore holds delegated permissions only and no client secret.
# Subscriptions are created by Presence's manage.js from the delegated sign-in (agent-presence
# README "Graph subscriptions: delegated only"); notifications arrive at
# https://${PUBLIC_DOMAIN}/webhooks/graph (Caddy, step 11) and wake Hermes on the `graph` route.
#
# HUMAN INTERACTION (--vm): the device-code sign-in as ${AGENT_UPN} (MFA via Presence's totp.mjs
# with TOTP_SECRET, or the authenticator the account was enrolled with).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
MODE="${1:-}"

GRAPH_API="00000003-0000-0000-c000-000000000000"   # Microsoft Graph (first-party app id, public)
DELEGATED_SCOPES=(User.Read User.Read.All offline_access
  Chat.ReadWrite ChatMessage.Send ChannelMessage.Send ChannelMessage.Read.All
  Mail.ReadWrite Mail.Send Mail.ReadWrite.Shared Calendars.ReadWrite
  OnlineMeetings.Read Tasks.ReadWrite Files.Read.All)

local_mode() {
  must_run_on local
  require GRAPH_APP_NAME
  step "Step 21 (local): app registration '${GRAPH_APP_NAME}' (delegated only, public client)"
  APP_ID="$(az ad app list --display-name "${GRAPH_APP_NAME}" --query '[0].appId' -o tsv)"
  if [ -z "${APP_ID}" ]; then
    APP_ID="$(az ad app create --display-name "${GRAPH_APP_NAME}" --sign-in-audience AzureADMyOrg \
              --is-fallback-public-client true --query appId -o tsv)"
    info "created ${APP_ID}"
  else
    az ad app update --id "${APP_ID}" --is-fallback-public-client true
    info "exists ${APP_ID}"
  fi
  az ad sp show --id "${APP_ID}" -o none 2>/dev/null || az ad sp create --id "${APP_ID}" -o none

  step "Delegated Microsoft Graph permissions"
  for scope in "${DELEGATED_SCOPES[@]}"; do
    SID="$(az ad sp show --id "${GRAPH_API}" --query "oauth2PermissionScopes[?value=='${scope}'].id | [0]" -o tsv)"
    [ -n "${SID}" ] || { warn "no Graph delegated scope '${scope}'"; continue; }
    if az ad app permission list --id "${APP_ID}" --query "[?resourceAppId=='${GRAPH_API}'].resourceAccess[].id" -o tsv | grep -qx "${SID}"; then
      info "${scope}: present"
    else
      az ad app permission add --id "${APP_ID}" --api "${GRAPH_API}" --api-permissions "${SID}=Scope" -o none 2>/dev/null
      info "${scope}: added"
    fi
  done
  step "Admin consent (tenant admin)"
  az ad app permission admin-consent --id "${APP_ID}"
  TENANT="$(az account show --query tenantId -o tsv)"
  USER_OID="$(az ad user show --id "${AGENT_UPN}" --query id -o tsv)"
  cat <<EOF

==> Step 21 (local) done. Values for the VM run (ids, not secrets; keep them out of git):
    export MS365_MCP_CLIENT_ID=${APP_ID}
    export MS365_MCP_TENANT_ID=${TENANT}
    export MS365_USER_ID=${USER_OID}
Then on the VM: ./21-setup-graph-webhooks.sh --vm
EOF
}

vm_mode() {
  must_run_on vm
  require PUBLIC_DOMAIN PRESENCE_DIR HERMES_DIR
  sudo test -f "${PRESENCE_DIR}/config/graph-adapter.service" || die "${PRESENCE_DIR} not synced: run 23-setup-call-bot.sh first"
  GSE="${HERMES_DIR}/graph-subscriptions.env"
  sudo test -f "${GSE}" || echo -n | install_text "${GSE}" 600 "${AGENT_NAME}"

  step "Step 21 (vm): ${GSE} (never printed)"
  for v in MS365_MCP_CLIENT_ID MS365_MCP_TENANT_ID MS365_USER_ID; do
    if env_has "${GSE}" "${v}"; then info "${v}: kept"
    else
      [ -n "${!v:-}" ] || die "${v} not set: export the values step 21 --local printed"
      set_env_line "${GSE}" "${v}" "${!v}"; info "${v}: set"
    fi
  done
  set_env_line "${GSE}" WEBHOOK_URL "https://${PUBLIC_DOMAIN}/webhooks/graph"
  env_has "${GSE}" CLIENT_STATE || set_env_line "${GSE}" CLIENT_STATE "${AGENT_NAME}-graph-$(openssl rand -hex 12)"
  if ! env_has "${GSE}" TOTP_SECRET; then
    if [ -t 0 ]; then
      read -r -s -p "TOTP seed for ${AGENT_UPN} (Enter to skip; used by totp.mjs for MFA): " TOTP_SECRET; echo
      [ -n "${TOTP_SECRET}" ] && set_env_line "${GSE}" TOTP_SECRET "${TOTP_SECRET}" && info "TOTP_SECRET: set"
    fi
  fi
  set_env_line "${GSE}" ACCOUNTS_MAILBOX "${ACCOUNTS_MAILBOX:-}"

  step "Presence Graph adapter + subscription renewal units"
  AGENT_SERVICE="hermes-gateway-${AGENT_NAME}.service"; STATE_DIR="${HERMES_DIR}"
  AGENT_UID="$(id -u "${AGENT_NAME}")"
  for unit in graph-adapter.service renew-subscriptions.service; do
    render_template "${PRESENCE_DIR}/config/${unit}" AGENT_NAME PRESENCE_DIR STATE_DIR AGENT_SERVICE AGENT_UID AVATAR_LABEL \
      | sudo tee "/etc/systemd/system/${unit%.service}-${AGENT_NAME}.service" >/dev/null
  done
  render_template "${AGENT_DIR}/config/systemd/renew-subscriptions.timer" AGENT_NAME \
    | sudo tee "/etc/systemd/system/renew-subscriptions-${AGENT_NAME}.timer" >/dev/null
  as_agent "cd '${PRESENCE_DIR}/src/graph-adapter' && npm ci --omit=dev --silent"
  as_agent "cd '${PRESENCE_DIR}/src/graph-subscriptions' && npm ci --omit=dev --silent"
  sudo systemctl daemon-reload
  sudo systemctl enable --now "graph-adapter-${AGENT_NAME}.service" "renew-subscriptions-${AGENT_NAME}.timer" >/dev/null
  info "graph-adapter-${AGENT_NAME} and renew-subscriptions-${AGENT_NAME}.timer enabled"

  step "Delegated sign-in as ${AGENT_UPN} (interactive device code, once)"
  if as_agent "source '${PRESENCE_DIR}/scripts/env.sh' >/dev/null 2>&1; node '${PRESENCE_DIR}/scripts/graph.mjs' get-user" >/dev/null 2>&1; then
    info "token cache works; skipping sign-in"
  else
    [ -t 0 ] || die "no delegated token yet and no terminal for the device-code sign-in"
    as_agent "source '${PRESENCE_DIR}/scripts/env.sh'; node '${PRESENCE_DIR}/scripts/graph.mjs' login"
  fi

  step "Subscriptions (Presence manage.js; create is idempotent)"
  as_agent "set -a; source '${GSE}'; set +a; PRESENCE_STATE_DIR='${HERMES_DIR}' node '${PRESENCE_DIR}/src/graph-subscriptions/manage.js' create"

  if [ -n "${ACCOUNTS_MAILBOX:-}" ]; then
    step "Bill capture wake for ${ACCOUNTS_MAILBOX} (${ACCOUNTS_MAILBOX_WAKE:-poll})"
    if as_agent "source '${PRESENCE_DIR}/scripts/env.sh' >/dev/null 2>&1; MS365_USER_ID='${ACCOUNTS_MAILBOX}' node '${PRESENCE_DIR}/scripts/graph.mjs' list-mail --folder Inbox --top 1" >/dev/null 2>&1; then
      info "Bookie can read ${ACCOUNTS_MAILBOX} (FullAccess + Mail.ReadWrite.Shared work)"
    else
      warn "Bookie cannot read ${ACCOUNTS_MAILBOX} yet: run 10-grant-accounts-mailbox.ps1, wait for Exchange to apply it (up to an hour), sign in again (graph.mjs login), re-run this step"
    fi
    info "poll: the bill-capture cron job + accounts-inbox-gate.sh (step 04) wake Bookie for new mail"
    if [ "${ACCOUNTS_MAILBOX_WAKE:-poll}" = "webhook" ]; then
      for u in service timer; do
        render_template "${AGENT_DIR}/config/systemd/accounts-subscription.${u}" AGENT_NAME AGENT_REPO HERMES_DIR PRESENCE_DIR ACCOUNTS_MAILBOX \
          | sudo tee "/etc/systemd/system/accounts-subscription-${AGENT_NAME}.${u}" >/dev/null
      done
      sudo systemctl daemon-reload
      if as_agent "set -a; source '${GSE}'; set +a; PRESENCE_DIR='${PRESENCE_DIR}' node '${AGENT_REPO}/agent/hermes/scripts/accounts-subscription.mjs' create"; then
        sudo systemctl enable --now "accounts-subscription-${AGENT_NAME}.timer" >/dev/null
        info "webhook subscription on ${ACCOUNTS_MAILBOX} Inbox created; renewal timer enabled"
      else
        warn "Graph refused the delegated subscription on ${ACCOUNTS_MAILBOX}; the poll wake still works (see 10-grant-accounts-mailbox.ps1 option B)"
      fi
    fi
  fi

  cat <<EOF

==> Step 21 (vm) done.
    curl -s 'https://${PUBLIC_DOMAIN}/webhooks/graph?validationToken=ping'     # expect: ping
    sudo -u ${AGENT_NAME} -i bash -lc 'set -a; source ~/.hermes/graph-subscriptions.env; node ${PRESENCE_DIR}/src/graph-subscriptions/manage.js list'
EOF
}

case "${MODE}" in
  --local) local_mode ;;
  --vm)    vm_mode ;;
  *) die "usage: $0 --local | --vm" ;;
esac
