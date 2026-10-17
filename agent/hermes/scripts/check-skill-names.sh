#!/usr/bin/env bash
# =============================================================================
# check-skill-names.sh: fail when a skill name appears in more than one of Bookie's
# skills.external_dirs. Hermes refuses an ambiguous name at load time ("Ambiguous skill
# name ... Refusing to guess") while `hermes skills list` still shows it, so a duplicate
# looks fine until it is used. Run by 04/33 after the farm is built, and in CI against
# agent/skills plus a Presence checkout.
#
# Usage: agent/hermes/scripts/check-skill-names.sh [dir ...]
#        (default: <repo>/agent/skills ~/presence/presence-skills ~/.hermes/marketplace-skills/*)
# Exit:  0 unique, 1 duplicate found, 2 usage error.
# =============================================================================
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ "$#" -gt 0 ]; then
  DIRS=("$@")
else
  DIRS=("${AGENT_DIR}/skills" "${PRESENCE_DIR:-${HOME}/presence}/presence-skills")
  for d in "${HOME}"/.hermes/marketplace-skills/*/; do [ -d "${d}" ] && DIRS+=("${d%/}"); done
fi

skill_name() {
  local n
  n="$(awk '
      /^---[[:space:]]*$/ { c++; if (c == 2) exit; next }
      c == 1 && /^name:[[:space:]]*/ { sub(/^name:[[:space:]]*/, ""); gsub(/^["'"'"']|["'"'"']$/, ""); print; exit }
  ' "$1/SKILL.md" 2>/dev/null || true)"
  [ -n "${n}" ] && echo "${n}" || basename "$1"
}

declare -A SEEN=()
DUP=0
for root in "${DIRS[@]}"; do
  [ -d "${root}" ] || { echo "skip (missing): ${root}"; continue; }
  for d in "${root}"/*/; do
    [ -f "${d}SKILL.md" ] || continue
    # The directory name is matched too, so check both.
    fm="$(skill_name "${d%/}")"; dn="$(basename "${d%/}")"
    names=("${fm}"); [ "${dn}" != "${fm}" ] && names+=("${dn}")
    for n in "${names[@]}"; do
      if [ -n "${SEEN[${n}]:-}" ] && [ "${SEEN[${n}]}" != "${d%/}" ]; then
        echo "DUPLICATE skill name '${n}': ${SEEN[${n}]} and ${d%/}"
        DUP=1
      else
        SEEN[${n}]="${d%/}"
      fi
    done
  done
done

if [ "${DUP}" != 0 ]; then
  echo "FAIL: rename the Bookie skill (agent/skills) or rebuild the farm (link-marketplace-skills.sh)."
  exit 1
fi
echo "skill names unique across ${#DIRS[@]} dir(s) (${#SEEN[@]} names)"
