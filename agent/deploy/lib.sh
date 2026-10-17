#!/usr/bin/env bash
# =============================================================================
# Shared helpers for Bookie's deploy scripts. Sourced, never run.
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# Loads config.env, defines logging, guards and a template renderer.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
AGENT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"     # <repo>/agent
CONFIG_ENV="${CONFIG_ENV:-${SCRIPT_DIR}/config.env}"

if [ ! -f "${CONFIG_ENV}" ]; then
  echo "ERROR: ${CONFIG_ENV} not found. cp config.env.example config.env and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${CONFIG_ENV}"

step() { echo; echo "==> $*"; }
info() { echo "    $*"; }
warn() { echo "WARNING: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# require VAR... : stop when a config value is empty.
require() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || die "${v} is empty (set it in ${CONFIG_ENV} or export it)."
  done
}

# Where a script must run. local = your workstation with az/pwsh; vm = on the VM as the admin user.
must_run_on() {
  case "$1" in
    # Azure names the host after the VM. ALLOW_ANY_HOST=1 overrides (a renamed host).
    vm)    [ "$(hostname)" = "${VM_NAME}" ] || [ "${ALLOW_ANY_HOST:-0}" = 1 ] \
             || die "run this ON the VM ${VM_NAME} (this host is $(hostname); ALLOW_ANY_HOST=1 to override)"
           id "${AGENT_NAME}" >/dev/null 2>&1 || [ "${ALLOW_NO_AGENT_USER:-0}" = 1 ] \
             || die "unix user '${AGENT_NAME}' missing: run 02-setup-desktop.sh first" ;;
    local) command -v az >/dev/null || die "Azure CLI (az) not found: run this on your workstation"
           az account show -o none 2>/dev/null || die "not logged in: az login" ;;
  esac
}

as_agent() { sudo -u "${AGENT_NAME}" -H bash -lc "$1"; }

# Escape a value for the replacement side of a |-delimited sed expression.
sed_esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }

# render_template FILE VAR... : print FILE with every {{VAR}} replaced by its value.
render_template() {
  local file="$1"; shift
  local args=() v
  for v in "$@"; do
    args+=(-e "s|{{${v}}}|$(sed_esc "${!v:-}")|g")
  done
  # The agent user's files are not readable by the admin user, so read via sudo.
  sudo cat "${file}" | sed "${args[@]}"
}

# install_text DEST MODE OWNER : write stdin to DEST atomically with mode/owner (via sudo).
install_text() {
  local dest="$1" mode="$2" owner="$3" tmp
  tmp="$(mktemp)"
  cat > "${tmp}"
  sudo install -o "${owner}" -g "${owner}" -m "${mode}" "${tmp}" "${dest}"
  rm -f "${tmp}"
}

# set_env_line FILE NAME VALUE : replace or append NAME='VALUE' in a chmod 600 env file
# owned by the agent. The value is never printed. Single quotes are refused: these files are also sourced by bash.
set_env_line() {
  local file="$1" name="$2" value="$3" tmp
  case "${value}" in *"'"*) die "${name} must not contain a single quote" ;; esac
  tmp="$(mktemp)"
  if sudo test -f "${file}"; then
    # shellcheck disable=SC2024  # the redirect is meant to write our own temp file
    sudo cat "${file}" > "${tmp}" || { rm -f "${tmp}"; die "cannot read ${file}"; }
    sed -i "/^${name}=/d" "${tmp}"
  fi
  printf "%s='%s'\n" "${name}" "${value}" >> "${tmp}"
  sudo install -o "${AGENT_NAME}" -g "${AGENT_NAME}" -m 600 "${tmp}" "${file}"
  rm -f "${tmp}"
}

# env_has FILE NAME : true when NAME has a non-empty value in FILE.
env_has() { sudo grep -qE "^$2=['\"]?[^'\"[:space:]]" "$1" 2>/dev/null; }

# prompt_secret VAR "Label" : read a secret without echo into VAR (unless already exported).
prompt_secret() {
  local __var="$1" __label="$2" __val
  if [ -n "${!__var:-}" ]; then return 0; fi
  [ -t 0 ] || die "${__var} is not set and there is no terminal to prompt on"
  read -r -s -p "${__label}: " __val; echo
  [ -n "${__val}" ] || die "${__label} is empty"
  printf -v "${__var}" '%s' "${__val}"
}
