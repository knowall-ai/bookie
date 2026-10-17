#!/usr/bin/env bash
# =============================================================================
# link-marketplace-skills.sh: build ~/.hermes/marketplace-skills/<pack>/ as a
# name-deduplicated symlink farm over the Claude Code marketplace packs.
# Adapted from knowall-ai/poppie-hermes (same script, Bookie's paths).
#
# WHY: hermes-agent refuses to load a skill whose name matches another skill in
# any configured skills.external_dirs ("Ambiguous skill name ... Refusing to
# guess"). Pointing external_dirs straight at a pack root breaks every name the
# pack shares with Presence (today: knowall-ai `email`). Renaming the symlink does
# not help (the loader also matches the frontmatter `name:`), so a colliding pack
# skill is dropped from the farm instead.
#
# Rebuilt from scratch on every run; safe to re-run. If it is never built the
# configured dir does not exist and Hermes skips it: Bookie loses the pack skills
# (xero, business-central) but nothing breaks.
#
# Usage: agent/hermes/scripts/link-marketplace-skills.sh [--dry-run]
# Env:   MARKETPLACE_ROOT (default ~/.claude/plugins/marketplaces)
#        FARM_ROOT        (default ~/.hermes/marketplace-skills)
#        PRESENCE_DIR     (default ~/presence)
#        REPO_SKILLS      (default <repo>/agent/skills)
#        PACKS            (default "knowall-ai")
# =============================================================================
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # <repo>/agent
MARKETPLACE_ROOT="${MARKETPLACE_ROOT:-${HOME}/.claude/plugins/marketplaces}"
FARM_ROOT="${FARM_ROOT:-${HOME}/.hermes/marketplace-skills}"
PRESENCE_DIR="${PRESENCE_DIR:-${HOME}/presence}"
REPO_SKILLS="${REPO_SKILLS:-${AGENT_DIR}/skills}"
PACKS="${PACKS:-knowall-ai}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# Resolve a skill's name: frontmatter `name:` if present, else the directory name.
skill_name() {
    local dir="$1" n
    n="$(awk '
        /^---[[:space:]]*$/ { c++; if (c == 2) exit; next }
        c == 1 && /^name:[[:space:]]*/ { sub(/^name:[[:space:]]*/, ""); gsub(/^["'"'"']|["'"'"']$/, ""); print; exit }
    ' "${dir}/SKILL.md" 2>/dev/null || true)"
    [ -n "${n}" ] && echo "${n}" || basename "${dir}"
}

# Names already claimed by dirs that outrank the packs.
CLAIMED=" "
for root in "${REPO_SKILLS}" "${PRESENCE_DIR}/presence-skills"; do
    [ -d "${root}" ] || continue
    for d in "${root}"/*/; do
        [ -f "${d}SKILL.md" ] || continue
        CLAIMED="${CLAIMED}$(skill_name "${d%/}") "
    done
done
echo "==> Claimed by repo + Presence:${CLAIMED}"

for pack in ${PACKS}; do
    src="${MARKETPLACE_ROOT}/${pack}/skills"
    dst="${FARM_ROOT}/${pack}"
    if [ ! -d "${src}" ]; then
        echo "==> ${pack}: not installed at ${src}: skipping"
        continue
    fi

    linked=0; skipped=""
    if [ "${DRY_RUN}" -eq 0 ]; then
        rm -rf "${dst}"
        mkdir -p "${dst}"
    fi

    for d in "${src}"/*/; do
        [ -f "${d}SKILL.md" ] || continue
        base="$(basename "${d%/}")"
        name="$(skill_name "${d%/}")"
        # Collides with a repo/Presence skill, or with an earlier pack.
        case "${CLAIMED}" in
            *" ${name} "*) skipped="${skipped} ${name}"; continue ;;
        esac
        [ "${DRY_RUN}" -eq 0 ] && ln -sfn "${d%/}" "${dst}/${base}"
        CLAIMED="${CLAIMED}${name} "
        linked=$((linked + 1))
    done

    echo "==> ${pack}: linked ${linked} skill(s) into ${dst}"
    [ -n "${skipped}" ] && echo "    dropped (name already taken):${skipped}"
done

echo "==> Done. Point skills.external_dirs at ${FARM_ROOT}/<pack>, never the pack root."
