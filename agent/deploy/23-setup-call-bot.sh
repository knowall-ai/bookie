#!/usr/bin/env bash
# =============================================================================
# Step 23: Agent Presence (Teams presence, voice, avatar) from a pinned agent-presence commit
# Runs: ON the VM as the admin user. Idempotent. Refuses to touch a live call.
# =============================================================================
# Shape B of agent-presence's README ("Clone + rsync", what Poppie runs): a read-only deploy-key
# clone at ${PRESENCE_CHECKOUT}, checked out DETACHED at PRESENCE_PIN (never main), refused when
# dirty, rsynced (no .git, node_modules, livekit.yaml, .env) into ${PRESENCE_DIR}, which the
# services run from. Bookie supplies only identity as data: the avatar JSON, the voice persona,
# the call-bot .env (GPT-Live-1 on Azure) and the badge.
#
# HUMAN INTERACTION:
#   - a read-only GitHub deploy key for ${AGENT_NAME} on knowall-ai/agent-presence (private repo);
#   - TEAMS_PASSWORD for ${AGENT_UPN} (prompted once, stored only in the call-bot .env, chmod 600);
#   - the first Teams sign-in in Edge (RDP in and watch teams-presence complete MFA once).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
require PRESENCE_REPO PRESENCE_PIN PRESENCE_CHECKOUT PRESENCE_DIR AGENT_UPN AVATAR_LABEL

AGENT_HOME="/home/${AGENT_NAME}"
CB_ENV="${PRESENCE_DIR}/src/call-bot/.env"
STATE_ENV="${HERMES_DIR}/env"

step "Step 23: Agent Presence @ ${PRESENCE_PIN}"
STATUS="$(curl -s -m 3 "http://127.0.0.1:${BRIDGE_STATUS_PORT}/status" | grep -o '"status":"[a-z-]*"' || true)"
case "${STATUS}" in *in-call*) die "a call is in progress (${STATUS}); re-run when it has ended" ;; esac

if sudo test -d "${PRESENCE_CHECKOUT}/.git"; then
  as_agent "git -C '${PRESENCE_CHECKOUT}' fetch --quiet origin"
else
  as_agent "git clone --quiet '${PRESENCE_REPO}' '${PRESENCE_CHECKOUT}'" \
    || die "clone failed: add a read-only deploy key for ${AGENT_NAME} (~${AGENT_NAME}/.ssh) on agent-presence"
fi
[ -z "$(as_agent "git -C '${PRESENCE_CHECKOUT}' status --porcelain --untracked-files=all")" ] || die "${PRESENCE_CHECKOUT} is dirty; refusing to sync"
as_agent "git -C '${PRESENCE_CHECKOUT}' checkout --quiet --detach '${PRESENCE_PIN}'"
[ "$(as_agent "git -C '${PRESENCE_CHECKOUT}' rev-parse HEAD")" = "$(as_agent "git -C '${PRESENCE_CHECKOUT}' rev-parse '${PRESENCE_PIN}^{commit}'")" ] || die "not at pin ${PRESENCE_PIN}"
as_agent "rsync -a --delete --exclude .git --exclude node_modules --exclude livekit.yaml --exclude .env '${PRESENCE_CHECKOUT}/' '${PRESENCE_DIR}/'"
# The media bridge (media/livekit_bridge.py) runs on the host's python3, not in Docker: install its
# requirements for the agent user, and the speaker-ID models. Without them every call connects in
# Teams with no audio or video ("No module named 'livekit'").
as_agent "cd '${PRESENCE_DIR}/src/call-bot/media' && python3 -m pip install --user --quiet --disable-pip-version-check -r requirements.txt"
as_agent "cd '${PRESENCE_DIR}/src/call-bot/media' && [ -f models/silero_vad.onnx ] || bash fetch-speaker-models.sh"
as_agent "python3 -c 'from livekit import api, rtc'" || die "the media bridge's python packages did not install"
info "synced to ${PRESENCE_DIR} ($(as_agent "git -C '${PRESENCE_CHECKOUT}' log -1 --format='%h %s'"))"

step "Node dependencies (browser bridge, shared CLIs)"
as_agent "cd '${PRESENCE_DIR}/src/call-bot/browser' && npm ci --silent"
as_agent "cd '${PRESENCE_DIR}/scripts' && npm ci --silent"

step "Presence state env ${STATE_ENV} (read by the Presence systemd units)"
sudo test -f "${STATE_ENV}" || echo -n | install_text "${STATE_ENV}" 600 "${AGENT_NAME}"
hermes_val() { sudo sed -n "s/^$1=['\"]\{0,1\}\([^'\"]*\).*/\1/p" "${HERMES_DIR}/.env" | head -1; }
GRAPH_WEBHOOK_SECRET="$(hermes_val GRAPH_WEBHOOK_SECRET)"
API_SERVER_KEY="$(hermes_val API_SERVER_KEY)"
[ -n "${GRAPH_WEBHOOK_SECRET}" ] && [ -n "${API_SERVER_KEY}" ] || die "run 04-configure-hermes.sh first (secrets missing in ${HERMES_DIR}/.env)"
declare -A STATE=(
  [AGENT_NAME]="${AGENT_NAME}" [AGENT_DISPLAY_NAME]="${AGENT_DISPLAY_NAME}" [AGENT_EMAIL]="${AGENT_UPN}"
  [PRESENCE_STATE_DIR]="${HERMES_DIR}" [HERMES_WEBHOOK_URL]="http://127.0.0.1:${HERMES_WEBHOOK_PORT}"
  [GRAPH_WEBHOOK_SECRET]="${GRAPH_WEBHOOK_SECRET}" [GRAPH_DEFAULT_AUTH]=delegated
  [INTERNAL_DOMAINS]="${M365_DOMAIN}" [CALL_TRANSCRIPTS_DIR]="${AGENT_HOME}/call-transcripts"
)
for k in "${!STATE[@]}"; do set_env_line "${STATE_ENV}" "${k}" "${STATE[${k}]}"; done

step "Call-bot env ${CB_ENV} (identity + GPT-Live-1; secrets never printed)"
if ! sudo test -f "${CB_ENV}"; then
  sed -e "s|/home/bookie/|${AGENT_HOME}/|g" "${AGENT_DIR}/config/presence/call-bot.env.example" \
    | install_text "${CB_ENV}" 600 "${AGENT_NAME}"
  info "created from agent/config/presence/call-bot.env.example"
fi
declare -A CB=(
  [AGENT_NAME]="${AGENT_NAME}" [AGENT_DISPLAY_NAME]="${AGENT_DISPLAY_NAME}"
  [AGENT_EMAIL]="${AGENT_UPN}" [TEAMS_EMAIL]="${AGENT_UPN}" [INTERNAL_DOMAINS]="${M365_DOMAIN}"
  [CALL_TRANSCRIPTS_DIR]="${AGENT_HOME}/call-transcripts" [AVATAR_STATE_DIR]="${AGENT_HOME}/call-transcripts"
  [PRESENCE_STATE_DIR]="${HERMES_DIR}" [VOICE_PERSONA_FILE]="${HERMES_DIR}/voice_persona.md"
  [PRESENCE_AVATAR_CONFIG]="${AGENT_REPO}/agent/assets/${AGENT_NAME}-avatar.json"
  [AVATAR_BADGE]="${AGENT_DISPLAY_NAME^^}" [AVATAR_LABEL]="${AVATAR_LABEL}" [HERMES_UNIT]="hermes-gateway-${AGENT_NAME}"
  [DEEPBRAIN_API]=chat [DEEPBRAIN_URL]="http://127.0.0.1:${HERMES_API_PORT}" [DEEPBRAIN_API_KEY]="${API_SERVER_KEY}"
  [DEEPBRAIN_MODEL]="${MODEL_MAIN}" [HUD_BRAIN_MODEL]="${MODEL_MAIN}"
  # 60 ms like Poppie: 160 ms plus the writer's 60 ms lead overfills paplay's 200 ms buffer, so every
  # frame stalled and call audio stuttered.
  [PLAYOUT_PREBUFFER_MS]=60
  [AVATAR_HUD]=1             # usage, subscription and machine telemetry panels on (Ben, 2026-10-18: wants them with the feed)
  [AVATAR_DEV]=1             # but do show the DEEP BRAIN activity feed, top left
  [HUD_VOICE_MODEL]="${VOICE_LIVE_MODEL:-gpt-live-1}"   # the HUD label otherwise shows the rollback realtime model
  [USAGE_PROVIDER]=codex     # HUD subscription gauge from Hermes's ChatGPT (openai-codex) sign-in, as Poppie
  [AVATAR_LASHES]=off        # Bookie has no eyelashes (Presence's default draws Sallie's)
  [AVATAR_TICKER]=0          # no scrolling activity ticker along the bottom of the video (as Poppie)
  [VOICE_MODE]="${VOICE_MODE}" [VOICE_REALTIME_PROVIDER]="${VOICE_REALTIME_PROVIDER}"
  [VOICE_LIVE_PROVIDER]="${VOICE_LIVE_PROVIDER}" [VOICE_LIVE_VOICE]="${VOICE_LIVE_VOICE}"
  [AZURE_LIVE_ENDPOINT]="${AZURE_LIVE_ENDPOINT}" [AZURE_LIVE_DEPLOYMENT]="${AZURE_LIVE_DEPLOYMENT}"
  [AZURE_LIVE_BACKEND_DEPLOYMENT]="${AZURE_LIVE_BACKEND_DEPLOYMENT}"
  [VOICE_REALTIME_MODEL]="${VOICE_REALTIME_MODEL}" [VOICE_REALTIME_VOICE]="${VOICE_REALTIME_VOICE}"
  [VOICE_REALTIME_LANGUAGE]="${VOICE_REALTIME_LANGUAGE}"
  [VISION_PROVIDER]=azure [AZURE_VISION_ENDPOINT]="https://${AI_RESOURCE_NAME}.openai.azure.com"
  [AZURE_VISION_DEPLOYMENT]="${AI_BRAIN_DEPLOYMENT}"
)
for k in "${!CB[@]}"; do set_env_line "${CB_ENV}" "${k}" "${CB[${k}]}"; done
# ~/presence is a deployed copy without .git, so Presence can't read its own version (it would show
# "v0.0.0-unknown"). Stamp the pinned checkout's version in; Presence prefers PRESENCE_VERSION.
PRESENCE_VER="$(as_agent "python3 '${PRESENCE_CHECKOUT}/src/call-bot/media/sallie_version.py'" 2>/dev/null || true)"
if [ -n "${PRESENCE_VER}" ] && [ "${PRESENCE_VER}" != "v0.0.0-unknown" ]; then
  set_env_line "${CB_ENV}" PRESENCE_VERSION "${PRESENCE_VER}"; info "Presence version ${PRESENCE_VER}"
fi
# Outside callers Bookie may identify on direct calls (Presence #354): "<tenant id>:<object id>,...",
# from config.env only (ids, never names). Blank = none.
if [ -n "${TRUSTED_EXTERNAL_CALLERS:-}" ]; then set_env_line "${CB_ENV}" TRUSTED_EXTERNAL_CALLERS "${TRUSTED_EXTERNAL_CALLERS}"; fi
# Presence's memory self-check reads Reverie over HTTP with the token step 40 created.
REVERIE_SERVE_ENV="/home/${AGENT_NAME}/.config/reverie/serve.env"
if sudo test -s "${REVERIE_SERVE_ENV}"; then
  set_env_line "${CB_ENV}" REVERIE_SERVE_TOKEN "$(sudo sed -n 's/^REVERIE_SERVE_TOKEN=//p' "${REVERIE_SERVE_ENV}")"
fi
for k in LIVEKIT_API_SECRET SPEND_TOKEN; do
  env_has "${CB_ENV}" "${k}" || set_env_line "${CB_ENV}" "${k}" "$(openssl rand -hex 24)"
done
env_has "${CB_ENV}" LIVEKIT_API_KEY || set_env_line "${CB_ENV}" LIVEKIT_API_KEY "key_$(openssl rand -hex 12)"
# Call wakes (missed call, call ended, recap) go to the graph adapter on :3005, which hands them to
# Hermes, exactly as on Poppie. Without these the bridge defaults to OpenClaw's :3000 (Sallie) and
# every wake is quarantined. The adapter and the bridge must share HOOKS_TOKEN.
HOOKS_ENV="${HERMES_DIR}/env"
env_has "${HOOKS_ENV}" HOOKS_TOKEN || set_env_line "${HOOKS_ENV}" HOOKS_TOKEN "$(openssl rand -hex 24)"
set_env_line "${HOOKS_ENV}" OPENCLAW_URL "http://127.0.0.1:3005"
HOOKS_TOKEN="$(sudo grep -E '^HOOKS_TOKEN=' "${HOOKS_ENV}" | head -1 | cut -d= -f2- | tr -d "'\"")"
set_env_line "${CB_ENV}" HOOKS_TOKEN "${HOOKS_TOKEN}"
set_env_line "${CB_ENV}" OPENCLAW_HOST 127.0.0.1
set_env_line "${CB_ENV}" OPENCLAW_PORT 3005
set_env_line "${CB_ENV}" OPENCLAW_URL "http://127.0.0.1:3005"
# Presence resolves the caller's identity through Graph; without these the caller email is empty and
# Bookie (correctly) refuses to give figures on a call. Same app and tenant as graph-subscriptions.env.
GS_ENV="${HERMES_DIR}/graph-subscriptions.env"
for k in MS365_MCP_CLIENT_ID MS365_MCP_TENANT_ID; do
  v="$(sudo grep -E "^(export )?${k}=" "${GS_ENV}" 2>/dev/null | head -1 | sed -E "s/^(export )?${k}=//; s/^['\"]//; s/['\"]$//")"
  [ -n "${v}" ] && set_env_line "${CB_ENV}" "${k}" "${v}" || warn "${k} not found in ${GS_ENV}: run step 21 first, or calls cannot identify the caller"
done
if ! env_has "${CB_ENV}" TEAMS_PASSWORD; then
  if [ -t 0 ] || [ -n "${TEAMS_PASSWORD:-}" ]; then
    prompt_secret TEAMS_PASSWORD "Microsoft 365 password for ${AGENT_UPN} (Teams web sign-in)"
    set_env_line "${CB_ENV}" TEAMS_PASSWORD "${TEAMS_PASSWORD}"
  else
    warn "TEAMS_PASSWORD not set in ${CB_ENV}; teams-presence cannot sign in until it is"
  fi
fi
case "${AZURE_LIVE_ENDPOINT}" in
  *"${AI_RESOURCE_NAME}"*) info "voice: gpt-live-1 on Bookie's own resource" ;;
  *) warn "voice: gpt-live-1 on a borrowed resource (${AZURE_LIVE_ENDPOINT}); switch back when Bookie's quota is granted" ;;
esac

step "Virtual camera/microphone + Presence systemd units"
echo "options v4l2loopback devices=2 video_nr=0,1 card_label=${AVATAR_LABEL},${AVATAR_LABEL}-Portrait exclusive_caps=1,1 max_buffers=8" \
  | sudo tee /etc/modprobe.d/v4l2loopback.conf >/dev/null
AGENT_SERVICE="hermes-gateway-${AGENT_NAME}.service"; STATE_DIR="${HERMES_DIR}"; AGENT_UID="$(id -u "${AGENT_NAME}")"
UNITS=(pulse-setup teams-presence call-bot-bridge call-bot)
for u in "${UNITS[@]}"; do
  render_template "${PRESENCE_DIR}/config/${u}.service" AGENT_NAME PRESENCE_DIR STATE_DIR AGENT_SERVICE AGENT_UID AVATAR_LABEL \
    | sudo tee "/etc/systemd/system/${u}-${AGENT_NAME}.service" >/dev/null
  grep -q '{{' "/etc/systemd/system/${u}-${AGENT_NAME}.service" && warn "${u}: unrendered placeholder left (new Presence variable?)"
done
sudo systemctl daemon-reload

step "Voice agent container (docker compose build agent)"
as_agent "cd '${PRESENCE_DIR}/src/call-bot' && docker compose build agent"

for u in "${UNITS[@]}"; do sudo systemctl enable "${u}-${AGENT_NAME}.service" >/dev/null; done

step "Skill farm rebuilt now that presence-skills exists (drops pack skills Presence owns, e.g. email)"
as_agent "PRESENCE_DIR='${PRESENCE_DIR}' MARKETPLACE_ROOT='${SKILLS_SYNC_ROOT}' FARM_ROOT='${HERMES_DIR}/marketplace-skills' PACKS='${SKILL_PACKS}' bash '${AGENT_REPO}/agent/hermes/scripts/link-marketplace-skills.sh'"
as_agent "PRESENCE_DIR='${PRESENCE_DIR}' bash '${AGENT_REPO}/agent/hermes/scripts/check-skill-names.sh'"
info "enabled; boot order pulse-setup -> teams-presence -> call-bot-bridge -> call-bot"

cat <<EOF

==> Step 23 done. Start (no call can be live yet):
    sudo systemctl restart pulse-setup-${AGENT_NAME} teams-presence-${AGENT_NAME} call-bot-bridge-${AGENT_NAME} call-bot-${AGENT_NAME}
    journalctl -u teams-presence-${AGENT_NAME} -f      # watch the first Teams sign-in (MFA once, over RDP)
    curl -s http://127.0.0.1:${BRIDGE_STATUS_PORT}/status
Rollback voice: set VOICE_REALTIME_PROVIDER=openai (+ OPENAI_API_KEY) in ${CB_ENV}, restart call-bot-${AGENT_NAME}.
Next: 21-setup-graph-webhooks.sh --vm (it needs ${PRESENCE_DIR}).
EOF
