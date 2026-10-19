#!/usr/bin/env bash
# =============================================================================
# deploy-all.sh: provision Bookie end to end, in order, from your workstation.
#   ./deploy-all.sh --local-only    # Azure/Entra/M365 steps that run here (az, pwsh)
#   ./deploy-all.sh --vm-only       # steps that run ON the VM (over SSH, interactive TTY)
#   ./deploy-all.sh --all           # both, local first (default)
#   ./deploy-all.sh --list          # print the plan, run nothing
# Every step is idempotent, so a failed run is fixed and re-run from the top.
# Steps needing a human (licence seat, BC "Microsoft Entra Applications" card, Xero Custom
# Connection, Teams/Exchange admin PowerShell, device-code sign-in, DNS) stop or prompt and
# say so. See agent/README.md "Provisioning" for the same list with explanations.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
MODE="${1:---all}"

# "where|script args|what". local = here; vm = on the VM via ssh -t; manual = printed only.
PLAN=(
  "local|01-create-vm.sh|Resource group + VM with managed identity"
  "manual|DNS|A record ${PUBLIC_DOMAIN} -> the VM's public IP (printed by step 01)"
  "local|05-create-entra-user.sh|Entra user ${AGENT_UPN} (prompts for the initial password)"
  "local|06-add-to-ai-agents-group.sh|AI Agents groups (Entra + Exchange; pwsh sign-in)"
  "local|07-assign-license.sh|M365 licence (needs a free seat)"
  "local|pwsh:08-restrict-email.ps1|Check the shared AI Agents email moderation rule (check only)"
  "local|pwsh:09-restrict-teams.ps1|Information Barriers (or -FallbackMessagingPolicy)"
  "local|pwsh:10-grant-accounts-mailbox.ps1|FullAccess on ${ACCOUNTS_MAILBOX:-<no accounts mailbox>} (bill capture)"
  "local|12-lockdown-nsg.sh|NSG: SSH/RDP from your IP only"
  "local|13-create-ai-resource.sh|Azure OpenAI ${AI_RESOURCE_NAME} + deployments + VM role"
  "local|21-setup-graph-webhooks.sh --local|Graph app registration (delegated) + admin consent"
  "local|31-setup-telemetry.sh --azure|Log Analytics + Application Insights"
  "local|41-install-bc-mcp.sh --local|BC service-to-service app + consent (then the BC UI card)"
  "vm|02-setup-desktop.sh|Kubuntu + xRDP + agent user (reboots)"
  "vm|03-install-software.sh|Edge, Node, Docker, media stack, az"
  "vm|25-setup-swap.sh|Swap file"
  "vm|04-configure-hermes.sh|Hermes, .env, config.yaml, SOUL, skill farm, cron (prompts for the AI key)"
  "vm|11-setup-ssl-proxy.sh|Caddy + Let's Encrypt for ${PUBLIC_DOMAIN}"
  "vm|40-install-reverie.sh|Neo4j + mcp-reverie + hermes-reverie"
  "vm|41-install-bc-mcp.sh --vm|BC MCP server + BC_* secrets (prompts unless pushed)"
  "vm|42-install-xero-credentials.sh|Xero Custom Connection keys (prompts)"
  "vm|23-setup-call-bot.sh|Agent Presence @ PRESENCE_PIN, GPT-Live-1 env, units (prompts for TEAMS_PASSWORD)"
  "vm|21-setup-graph-webhooks.sh --vm|Graph adapter, device-code sign-in, subscriptions, accounts@ wake"
  "vm|31-setup-telemetry.sh --vm|agent-pulse plugin"
  "vm|33-setup-skills-sync.sh|Skills sync timer"
)

VM_HOST="${VM_ADMIN_USER}@${PUBLIC_DOMAIN}"
run_step() {
  local where="$1" cmd="$2" what="$3"
  echo; echo "---------------------------------------------"
  echo " [${where}] ${cmd}: ${what}"
  echo "---------------------------------------------"
  case "${where}" in
    manual) echo "MANUAL: ${what}"; [ -t 0 ] && read -r -p "Press Enter when done... " _ ;;
    local)
      if [[ "${cmd}" == pwsh:* ]]; then
        command -v pwsh >/dev/null || { warn "pwsh missing: run ${cmd#pwsh:} on a machine with PowerShell 7"; return 0; }
        pwsh -NoProfile -File "${SCRIPT_DIR}/${cmd#pwsh:}" -ConfigFile "${CONFIG_ENV}"
      else
        # shellcheck disable=SC2086
        bash "${SCRIPT_DIR}/"${cmd}
      fi ;;
    vm)
      # The admin's checkout on the VM is ~/bookie with agent/deploy/config.env copied in.
      ssh -t "${VM_HOST}" "cd ~/bookie/agent/deploy && bash ./${cmd}" ;;
  esac
}

if [ "${MODE}" = "--list" ]; then
  for p in "${PLAN[@]}"; do IFS='|' read -r w c d <<< "${p}"; printf '%-7s %-40s %s\n' "${w}" "${c}" "${d}"; done
  exit 0
fi

echo "============================================="
echo " Bookie deployment: ${AGENT_DISPLAY_NAME} <${AGENT_UPN}>  mode ${MODE}"
echo "============================================="
for p in "${PLAN[@]}"; do
  IFS='|' read -r where cmd what <<< "${p}"
  case "${MODE}" in
    --local-only) [ "${where}" = vm ] && continue ;;
    --vm-only)    [ "${where}" != vm ] && continue ;;
    --all) ;;
    *) die "unknown mode ${MODE}" ;;
  esac
  if [ "${where}" = vm ] && [ "${MODE}" = --all ] && [ "${cmd}" = "02-setup-desktop.sh" ]; then
    echo "Before the VM steps: on the VM, git clone ${AGENT_REPO_URL} ~/bookie and copy config.env to ~/bookie/agent/deploy/"
    [ -t 0 ] && read -r -p "Press Enter when done... " _
  fi
  run_step "${where}" "${cmd}" "${what}"
  if [ "${cmd}" = "02-setup-desktop.sh" ]; then
    echo "Waiting for the VM to come back after the reboot..."
    sleep 60; until ssh -o ConnectTimeout=5 "${VM_HOST}" true 2>/dev/null; do sleep 10; done
  fi
done

cat <<EOF

=============================================
 Remaining human steps
=============================================
 - BC: "Microsoft Entra Applications" card for ${BC_APP_NAME} (permission sets, Grant Consent): see 41-install-bc-mcp.sh header
 - Xero: Custom Connection per organisation before step 42 (scopes in its header)
 - accounts mailbox: create folders ${BILL_CAPTURE_PROCESSED_FOLDER} and ${BILL_CAPTURE_REVIEW_FOLDER}
 - First Teams sign-in in Edge over RDP (MFA once); profile photo from agent/assets/avatar
 - Start: ./safe-deploy.sh 'sudo systemctl start hermes-gateway-${AGENT_NAME}'
=============================================
EOF
