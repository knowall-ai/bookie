#!/usr/bin/env bash
# =============================================================================
# skills-sync.sh: keep the Claude Code plugin packs Bookie loads skills from
# current, safely. Run as the agent user by skills-sync-<agent>.timer (agent/deploy/33).
# Adapted from knowall-ai/poppie-hermes.
# =============================================================================
# For each pack clone under ${SKILLS_SYNC_ROOT} (default ~/.claude/plugins/marketplaces):
#   - git fetch;
#   - fast-forward (git merge --ff-only --no-overwrite-ignore origin/main) ONLY when the clone is
#     on main, its working tree is clean (untracked files count) and HEAD is behind
#     origin/main. --no-overwrite-ignore refuses to clobber an ignored local file that
#     upstream now tracks; the clone is then left as it was;
#   - anything else (dirty, another branch, detached, ahead, diverged, fetch failed) is
#     left exactly as it is: a WARNING goes to the journal and the run exits non-zero,
#     after the other packs have been processed. Never stashes, resets or discards.
# After a pull that added, removed or renamed a skill (or changed a frontmatter
# `name:`, which the de-duplication keys on) the farm is rebuilt with
# link-marketplace-skills.sh. SKILL.md body edits need nothing: the farm is symlinks.
# A failed rebuild leaves ${SKILLS_SYNC_STATE}/rebuild-pending, so later runs retry it
# even though the clones have already moved on.
#
# Hermes and changed skills (hermes-agent agent/prompt_builder.py, tools/skills_tool.py):
#   - SKILL.md body edits are live: skill_view reads the file at call time (catalog
#     cache: 30 s TTL plus a directory-mtime signature).
#   - The skills INDEX in the system prompt (names + descriptions) is built at session
#     start through an in-process LRU keyed on the external_dirs PATHS, not their
#     contents, so an added/renamed skill or a changed description is not advertised
#     until hermes-gateway-<agent> restarts. /reload-skills does not clear that cache.
#     This script never restarts the gateway (a call may be live). It leaves
#     ${SKILLS_SYNC_STATE}/restart-pending and logs "RESTART NEEDED" on every run until
#     the gateway has been (re)started after the change and after the last successful
#     farm rebuild (the marker is refreshed on each relink and kept while one is pending).
#
# Usage: agent/hermes/scripts/skills-sync.sh
# Env:   SKILLS_SYNC_ROOT   (default ~/.claude/plugins/marketplaces)
#        SKILLS_SYNC_PACKS  (default "knowall-ai")
#        SKILLS_SYNC_BRANCH (default main)
#        SKILLS_SYNC_REMOTE (default origin; the merge target is <remote>/<branch>)
#        SKILLS_SYNC_STATE  (default ~/.hermes/skills-sync; pending markers)
#        SKILLS_SYNC_GATEWAY_UNIT (default hermes-gateway-$USER)
# Exit:  0 all packs current or updated; 1 at least one pack skipped or failed, or the
#        farm rebuild failed.
# =============================================================================
set -uo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # <repo>/agent
ROOT="${SKILLS_SYNC_ROOT:-${HOME}/.claude/plugins/marketplaces}"
PACKS="${SKILLS_SYNC_PACKS:-knowall-ai}"
BRANCH="${SKILLS_SYNC_BRANCH:-main}"
REMOTE="${SKILLS_SYNC_REMOTE:-origin}"
STATE="${SKILLS_SYNC_STATE:-${HOME}/.hermes/skills-sync}"
GATEWAY_UNIT="${SKILLS_SYNC_GATEWAY_UNIT:-hermes-gateway-${USER:-bookie}}"
LINK_SCRIPT="${AGENT_DIR}/hermes/scripts/link-marketplace-skills.sh"
REBUILD_MARK="${STATE}/rebuild-pending"
RESTART_MARK="${STATE}/restart-pending"

# Never block on a prompt (no TTY under systemd).
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=20}"

# Under systemd, a "<4>" prefix makes journald record the line at warning priority.
if [ -n "${JOURNAL_STREAM:-}" ]; then WPFX="<4>"; else WPFX=""; fi
log()  { echo "$*"; }
warn() { echo "${WPFX}WARNING: $*"; }

# One frontmatter field of a SKILL.md on stdin, whitespace-normalised. Handles plain,
# quoted and YAML block scalars (`description: |` / `>` with indented lines below).
fm_field() {
    awk -v f="$1" '
        /^---[[:space:]]*$/ { c++; if (c == 2) exit; next }
        c != 1 { next }
        inblk { if ($0 ~ /^[[:space:]]/ || $0 ~ /^$/) { v = v " " $0; next } else exit }
        $0 ~ ("^" f ":") {
            v = $0; sub("^" f ":[[:space:]]*", "", v)
            if (v ~ /^[|>][-+0-9]*[[:space:]]*$/ || v == "") { v = ""; inblk = 1; next }
            exit
        }
        END { gsub(/[[:space:]]+/, " ", v); sub(/^ /, "", v); sub(/ $/, "", v); print v }'
}

# "<skills/dir/SKILL.md>\t<name>\t<description>" for every top-level skill at a commit.
skill_index() {
    local dir="$1" sha="$2" path body
    git -C "${dir}" ls-tree -r --name-only "${sha}" -- skills 2>/dev/null \
        | grep -E '^skills/[^/]+/SKILL\.md$' | sort | while read -r path; do
        body="$(git -C "${dir}" show "${sha}:${path}" 2>/dev/null)"
        printf '%s\t%s\t%s\n' "${path}" "$(fm_field name <<<"${body}")" "$(fm_field description <<<"${body}")"
    done
}

mark() { mkdir -p "${STATE}" && touch "$1"; }

FAILED=0

# The clone is on ${BRANCH} and its tree is clean (untracked files count), or warn and fail.
check_safe() {
    local pack="$1" dir="$2" branch
    branch="$(git -C "${dir}" symbolic-ref --quiet --short HEAD)" || branch="(detached HEAD)"
    if [ "${branch}" != "${BRANCH}" ]; then
        warn "${pack}: ${dir} is on ${branch}, not ${BRANCH}; left untouched (switch back by hand when that work is done)"
        return 1
    fi
    # --untracked-files=all: a status.showUntrackedFiles=no config must not hide work.
    if [ -n "$(git -C "${dir}" status --porcelain --untracked-files=all)" ]; then
        warn "${pack}: ${dir} has local changes; left untouched. Changed files:"
        git -C "${dir}" status --porcelain --untracked-files=all | sed "s/^/${WPFX}    /"
        return 1
    fi
}

sync_pack() {
    local pack="$1" dir="${ROOT}/$1" target old new ahead behind old_idx new_idx
    if ! git -C "${dir}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        warn "${pack}: no git clone at ${dir}; skipped"; return 1
    fi
    if ! git -C "${dir}" fetch --quiet --prune "${REMOTE}"; then
        warn "${pack}: git fetch ${REMOTE} failed in ${dir}; left as is"; return 1
    fi
    target="${REMOTE}/${BRANCH}"
    if ! git -C "${dir}" rev-parse --verify --quiet "refs/remotes/${target}" >/dev/null; then
        warn "${pack}: ${target} does not exist in ${dir}; left untouched"; return 1
    fi
    # Branch and cleanliness are read AFTER the fetch, then re-checked right before the
    # merge, which names ${target} explicitly (never @{u}): a feature branch is never moved.
    check_safe "${pack}" "${dir}" || return 1
    old="$(git -C "${dir}" rev-parse HEAD)"
    read -r ahead behind < <(git -C "${dir}" rev-list --left-right --count "HEAD...${target}")
    if [ "${ahead}" = 0 ] && [ "${behind}" = 0 ]; then
        log "${pack}: up to date at ${old:0:12}"; return 0
    fi
    if [ "${ahead}" != 0 ]; then
        warn "${pack}: ${dir} is ${ahead} commit(s) ahead of and ${behind} behind ${target} (local commits); left untouched"
        return 1
    fi
    check_safe "${pack}" "${dir}" || return 1
    if [ "$(git -C "${dir}" rev-parse HEAD)" != "${old}" ]; then
        warn "${pack}: HEAD moved during the sync in ${dir}; left untouched"; return 1
    fi
    # Fast-forward to the fetched ${target}, never overwriting ignored files.
    if ! git -C "${dir}" merge --ff-only --no-overwrite-ignore --no-autostash --quiet "${target}"; then
        warn "${pack}: fast-forward to ${target} refused in ${dir} (an ignored local file in the way?); left as is"
        return 1
    fi
    new="$(git -C "${dir}" rev-parse HEAD)"
    log "${pack}: updated ${old:0:12} -> ${new:0:12} (${behind} commit(s))"
    git -C "${dir}" log --oneline --no-decorate "${old}..${new}" | head -20 | sed 's/^/    /'

    # Did the set of skills, a name (farm de-duplication) or a description (index) change?
    old_idx="$(skill_index "${dir}" "${old}")"; new_idx="$(skill_index "${dir}" "${new}")"
    if [ "$(cut -f1 <<<"${old_idx}")" != "$(cut -f1 <<<"${new_idx}")" ]; then
        log "${pack}: skills added, removed or renamed:"
        diff <(cut -f1 <<<"${old_idx}") <(cut -f1 <<<"${new_idx}") | grep -E '^[<>]' \
            | sed -e 's|^< skills/\([^/]*\)/SKILL.md|    - \1|' -e 's|^> skills/\([^/]*\)/SKILL.md|    + \1|'
        mark "${REBUILD_MARK}"; mark "${RESTART_MARK}"
    elif [ "$(cut -f1,2 <<<"${old_idx}")" != "$(cut -f1,2 <<<"${new_idx}")" ]; then
        log "${pack}: a skill name changed"
        mark "${REBUILD_MARK}"; mark "${RESTART_MARK}"
    elif [ "${old_idx}" != "${new_idx}" ]; then
        log "${pack}: a skill description changed"
        mark "${RESTART_MARK}"
    fi
    return 0
}

for pack in ${PACKS}; do
    sync_pack "${pack}" || FAILED=1
done

# Pending until it succeeds: a failed rebuild is retried on every later run.
if [ -f "${REBUILD_MARK}" ]; then
    log "==> Skill set changed: rebuilding ~/.hermes/marketplace-skills"
    if PACKS="${PACKS}" bash "${LINK_SCRIPT}"; then
        rm -f "${REBUILD_MARK}"
        # The index changes only now: only a gateway start after this relink clears the notice.
        mark "${RESTART_MARK}"
    else
        warn "link-marketplace-skills.sh failed; the farm may be stale or partial. It is retried on the next run (manual: bash ${LINK_SCRIPT})"
        FAILED=1
    fi
fi

# Pending until the gateway has (re)started after the change that needed it, and never
# cleared while a farm rebuild is still pending (that restart would load the stale farm).
if [ -f "${RESTART_MARK}" ] && [ -f "${REBUILD_MARK}" ]; then
    log "RESTART NEEDED once the farm rebuild above succeeds (it is retried on the next run); then 'sudo systemctl restart ${GATEWAY_UNIT}' when no call is live."
elif [ -f "${RESTART_MARK}" ]; then
    started="$(systemctl show "${GATEWAY_UNIT}" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
    started_epoch="$( [ -n "${started}" ] && date -d "${started}" +%s 2>/dev/null || echo 0)"
    if [ "${started_epoch:-0}" -gt "$(stat -c %Y "${RESTART_MARK}")" ]; then
        rm -f "${RESTART_MARK}"
        log "${GATEWAY_UNIT} has restarted since the last skill change; restart notice cleared"
    else
        log "RESTART NEEDED for new skills: added/renamed skills and changed descriptions reach the skills index only after 'sudo systemctl restart ${GATEWAY_UNIT}' (do it when no call is live). Edited SKILL.md bodies are already live."
    fi
fi

if [ "${FAILED}" != 0 ]; then
    warn "skills sync finished with problems (see the warnings above); clean fast-forwards were still applied"
    exit 1
fi
log "skills sync OK"
