#!/usr/bin/env bash
# =============================================================================
# Step 40: Reverie graph memory (Neo4j + mcp-reverie server + hermes-reverie plugin)
# Runs: ON the VM as the admin user. Idempotent.
# =============================================================================
# - Neo4j 5 community with APOC in Docker, bound to loopback only, data in ~/neo4j/data.
#   One graph for Bookie alone: never shared with another agent or another organisation.
# - mcp-reverie (`reverie` on PATH) installed globally for the agent user, pinned by REVERIE_SERVER_SPEC.
# - hermes-reverie plugin into ~/.hermes/plugins/reverie at REVERIE_PLUGIN_REF.
# - NEO4J_* in ~/.hermes/.env (password generated once, never printed).
# The rule Bookie lives by: Reverie holds people, organisations, preferences and what was discussed,
# never ledger data from Xero or Business Central (SOUL.md rule 4).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
require NEO4J_IMAGE NEO4J_CONTAINER REVERIE_SERVER_SPEC REVERIE_PLUGIN_REPO REVERIE_PLUGIN_REF

AGENT_HOME="/home/${AGENT_NAME}"
ENV_FILE="${HERMES_DIR}/.env"

step "Step 40: Neo4j password"
if env_has "${ENV_FILE}" NEO4J_PASSWORD; then
  info "kept"
  NEO4J_PASSWORD="$(sudo sed -n "s/^NEO4J_PASSWORD=['\"]\{0,1\}\([^'\"]*\).*/\1/p" "${ENV_FILE}" | head -1)"
else
  NEO4J_PASSWORD="$(openssl rand -hex 24)"
  set_env_line "${ENV_FILE}" NEO4J_PASSWORD "${NEO4J_PASSWORD}"
  info "generated"
fi
set_env_line "${ENV_FILE}" NEO4J_URI "bolt://127.0.0.1:7687"
set_env_line "${ENV_FILE}" NEO4J_USERNAME "neo4j"
set_env_line "${ENV_FILE}" REVERIE_EMBEDDINGS "${REVERIE_EMBEDDINGS}"
set_env_line "${ENV_FILE}" REVERIE_MODEL_CACHE "${AGENT_HOME}/.cache/reverie-models"

step "Neo4j container ${NEO4J_CONTAINER} (loopback 7474/7687)"
as_agent "mkdir -p ~/neo4j/data ~/neo4j/logs ~/.cache/reverie-models"
if sudo docker inspect "${NEO4J_CONTAINER}" >/dev/null 2>&1; then
  info "exists ($(sudo docker inspect -f '{{.State.Status}}' "${NEO4J_CONTAINER}"))"
  sudo docker start "${NEO4J_CONTAINER}" >/dev/null
else
  # NEO4J_AUTH only takes effect on an empty data dir; the password is passed via a 0600 env file
  # so it never appears in `ps` or the shell history.
  AUTH_FILE="$(mktemp)"; chmod 600 "${AUTH_FILE}"
  printf 'NEO4J_AUTH=neo4j/%s\n' "${NEO4J_PASSWORD}" > "${AUTH_FILE}"
  sudo docker run -d --name "${NEO4J_CONTAINER}" --restart unless-stopped \
    -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
    -v "${AGENT_HOME}/neo4j/data:/data" -v "${AGENT_HOME}/neo4j/logs:/logs" \
    --env-file "${AUTH_FILE}" -e NEO4J_PLUGINS='["apoc"]' \
    -e NEO4J_server_memory_heap_max__size=1G \
    "${NEO4J_IMAGE}" >/dev/null
  rm -f "${AUTH_FILE}"
  info "started"
fi
for _ in $(seq 1 30); do
  curl -s -o /dev/null http://127.0.0.1:7474 && break
  sleep 2
done
curl -s -o /dev/null http://127.0.0.1:7474 || warn "Neo4j is not answering on 127.0.0.1:7474 yet (docker logs ${NEO4J_CONTAINER})"

step "mcp-reverie server (${REVERIE_SERVER_SPEC})"
as_agent "grep -q npm-global ~/.profile || printf '\\n# npm global installs (Reverie, BC MCP)\\nexport PATH=\\\"\\\$HOME/.npm-global/bin:\\\$PATH\\\"\\n' >> ~/.profile"
as_agent "npm install -g --silent '${REVERIE_SERVER_SPEC}'"
as_agent "command -v reverie" >/dev/null || die "reverie not on the agent's PATH (~/.npm-global/bin)"
info "$(as_agent "npm ls -g --depth 0 2>/dev/null | grep -i reverie" || true)"

step "hermes-reverie plugin @ ${REVERIE_PLUGIN_REF}"
PLUG="${HERMES_DIR}/plugins/reverie"
if sudo test -d "${PLUG}/.git"; then
  as_agent "git -C '${PLUG}' fetch --quiet origin"
else
  as_agent "mkdir -p '${HERMES_DIR}/plugins' && git clone --quiet '${REVERIE_PLUGIN_REPO}' '${PLUG}'"
fi
# A branch name resolves through origin/<ref>; a tag or commit resolves directly.
as_agent "git -C '${PLUG}' checkout --quiet --detach 'origin/${REVERIE_PLUGIN_REF}' 2>/dev/null || git -C '${PLUG}' checkout --quiet --detach '${REVERIE_PLUGIN_REF}'" \
  || die "cannot check out ${REVERIE_PLUGIN_REF} in ${PLUG}"
info "plugin at $(as_agent "git -C '${PLUG}' log -1 --format='%h %s'")"
as_agent "hermes plugins enable reverie" >/dev/null 2>&1 || info "(enabled through config.yaml plugins.enabled)"

step "Reverie over HTTP on localhost (Agent Presence's call self-check reads it)"
SERVE_ENV="/home/${AGENT_NAME}/.config/reverie/serve.env"
sudo install -d -m 700 -o "${AGENT_NAME}" -g "${AGENT_NAME}" "/home/${AGENT_NAME}/.config/reverie"
if ! sudo test -s "${SERVE_ENV}"; then
  printf 'REVERIE_SERVE_TOKEN=%s\nREVERIE_HTTP_HOST=127.0.0.1\nREVERIE_HTTP_PORT=8643\n' "$(openssl rand -hex 32)" \
    | sudo tee "${SERVE_ENV}" >/dev/null
  sudo chown "${AGENT_NAME}:${AGENT_NAME}" "${SERVE_ENV}"; sudo chmod 600 "${SERVE_ENV}"
fi
sudo tee "/etc/systemd/system/reverie-serve-${AGENT_NAME}.service" >/dev/null <<UNIT
[Unit]
Description=Reverie memory over HTTP for ${AGENT_NAME} (localhost only; Presence health check)
After=network-online.target
[Service]
User=${AGENT_NAME}
Environment=HOME=/home/${AGENT_NAME}
Environment=PATH=/home/${AGENT_NAME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${HERMES_DIR}/.env
EnvironmentFile=${SERVE_ENV}
ExecStart=/home/${AGENT_NAME}/.npm-global/bin/reverie serve
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now "reverie-serve-${AGENT_NAME}" >/dev/null 2>&1
info "reverie serve: $(curl -s -m5 http://127.0.0.1:8643/health || echo 'not answering yet')"

cat <<EOF

==> Step 40 done. Check (the first call downloads the local embedding model, ~23 MB):
    sudo -u ${AGENT_NAME} -i hermes memory status
    sudo -u ${AGENT_NAME} -i hermes plugins list | grep -E 'reverie|agent-pulse'
Dreaming (nightly consolidation) is installed by:  sudo -u ${AGENT_NAME} -i hermes memory setup
EOF
