#!/usr/bin/env bash
# =============================================================================
# Step 33: skills-sync-<agent>.timer keeps the marketplace skill packs current
# Runs: ON the VM as the admin user, after step 04. Idempotent (units re-rendered, timer re-enabled).
# Every SKILLS_SYNC_ON_CALENDAR it runs agent/hermes/scripts/skills-sync.sh as the agent user:
# fast-forward a clone only when it is on main, clean and behind; rebuild the de-duplicated farm
# when the skill set changes; log "RESTART NEEDED" (never restarts the gateway itself).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
require SKILLS_SYNC_ROOT SKILLS_SYNC_ON_CALENDAR SKILL_PACKS

UNIT="skills-sync-${AGENT_NAME}"
step "Step 33: ${UNIT} (${SKILLS_SYNC_ON_CALENDAR}) over ${SKILLS_SYNC_ROOT}: ${SKILL_PACKS}"
systemd-analyze calendar "${SKILLS_SYNC_ON_CALENDAR}" >/dev/null || die "invalid OnCalendar '${SKILLS_SYNC_ON_CALENDAR}'"
for pack in ${SKILL_PACKS}; do
  if as_agent "git -C '${SKILLS_SYNC_ROOT}/${pack}' rev-parse --is-inside-work-tree" >/dev/null 2>&1; then
    info "${pack}: $(as_agent "git -C '${SKILLS_SYNC_ROOT}/${pack}' status --short --branch | head -1")"
  else
    warn "${SKILLS_SYNC_ROOT}/${pack} is not a git clone (step 04 clones it)"
  fi
done
for u in service timer; do
  render_template "${AGENT_DIR}/config/systemd/skills-sync.${u}" AGENT_NAME AGENT_REPO PRESENCE_DIR SKILLS_SYNC_ROOT SKILLS_SYNC_ON_CALENDAR SKILL_PACKS \
    | sudo tee "/etc/systemd/system/${UNIT}.${u}" >/dev/null
done
sudo chmod 755 "${AGENT_REPO}/agent/hermes/scripts/skills-sync.sh" "${AGENT_REPO}/agent/hermes/scripts/link-marketplace-skills.sh"
sudo systemctl daemon-reload
sudo systemctl enable --now "${UNIT}.timer" >/dev/null
info "next run: $(systemctl show "${UNIT}.timer" -p NextElapseUSecRealtime --value)"
cat <<EOF
    Run now:   sudo systemctl start ${UNIT}.service; journalctl -u ${UNIT} -n 30 --no-pager
    "RESTART NEEDED" = new skills reach the index after: ./safe-deploy.sh 'sudo systemctl restart hermes-gateway-${AGENT_NAME}'
EOF
