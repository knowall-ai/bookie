#!/usr/bin/env bash
# Build the Bookie Bitcoin extension (.app) on Linux or macOS, with CodeCop,
# PerTenantExtensionCop and UICop, warnings as errors.
#
#   bc-extension-bitcoin/build.sh                    # symbols from Microsoft's public feed (no sign-in)
#   SYMBOLS=sandbox bc-extension-bitcoin/build.sh    # symbols from your BC environment's dev endpoint
#
# Env:
#   SYMBOLS         public (default) | sandbox
#   ALC_DLL         an AL compiler's alc.dll, run with `dotnet` (e.g. the AL Language VS Code
#                   extension's bin/alc.dll). Default: the `al` dotnet tool, as in CI.
#   DOTNET          dotnet to run ALC_DLL with (default: dotnet on PATH, else ~/.dotnet/dotnet)
#   For SYMBOLS=sandbox (signed in with `az login` as a user who can reach the environment):
#   BC_TENANT_ID    default: the Azure CLI's current tenant (never written to the repo)
#   BC_ENVIRONMENT  default: Sandbox (use the Sandbox for symbols)
#   BC_RUNTIME      symbol version to ask for, default 27.0.0.0 (app.json's application)
#
# Output: bc-extension-bitcoin/output/KnowAll_Bookie Bitcoin_<version>.app
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SYMBOLS="${SYMBOLS:-public}"

if [[ "${SYMBOLS}" == public && -z "${ALC_DLL:-}" ]]; then
  # The shared script downloads BC 27 symbols from the public MSSymbols feed and runs the `al` tool.
  exec env APP=bitcoin "${HERE}/../bc-extension/scripts/build.sh" "$@"
fi

CACHE="${HERE}/.alpackages"
OUT="${HERE}/output"
mkdir -p "${CACHE}" "${OUT}"

if [[ "${SYMBOLS}" == sandbox ]]; then
  TENANT="${BC_TENANT_ID:-$(az account show --query tenantId -o tsv)}"
  ENVIRONMENT="${BC_ENVIRONMENT:-Sandbox}"
  RUNTIME="${BC_RUNTIME:-27.0.0.0}"
  TOKEN="$(az account get-access-token --resource https://api.businesscentral.dynamics.com --query accessToken -o tsv)"
  for app in "System" "System Application" "Base Application" "Application"; do
    file="${CACHE}/Microsoft_${app// /_}.app"
    [[ -s "${file}" ]] && continue
    echo "Downloading symbols: ${app}"
    curl -fsS -G -o "${file}" -H "Authorization: Bearer ${TOKEN}" \
      --data-urlencode "publisher=Microsoft" --data-urlencode "appName=${app}" \
      --data-urlencode "versionText=${RUNTIME}" \
      "https://api.businesscentral.dynamics.com/v2.0/${TENANT}/${ENVIRONMENT}/dev/packages"
  done
elif [[ "${SYMBOLS}" == public ]]; then
  # Reuse the shared cache the public-feed build fills.
  CACHE="${HERE}/../bc-extension/.alpackages"
  [[ -d "${CACHE}" ]] || { echo "Run once without ALC_DLL to download the public symbols." >&2; exit 1; }
else
  echo "SYMBOLS must be public or sandbox." >&2
  exit 1
fi

if [[ -n "${ALC_DLL:-}" ]]; then
  DOTNET="${DOTNET:-$(command -v dotnet || echo "${HOME}/.dotnet/dotnet")}"
  RUN=("${DOTNET}" "${ALC_DLL}")
  ANALYZERS="$(dirname "$(find "$(dirname "${ALC_DLL}")" -name Microsoft.Dynamics.Nav.CodeCop.dll | head -1)")"
else
  AL_BIN="$(command -v al)" || { echo "Install the AL compiler: dotnet tool install --global Microsoft.Dynamics.BusinessCentral.Development.Tools" >&2; exit 1; }
  RUN=("${AL_BIN}" compile)
  STORE="$(dirname "$(readlink -f "${AL_BIN}")")/.store"
  ANALYZERS="$(dirname "$(find "${STORE}" -name Microsoft.Dynamics.Nav.CodeCop.dll | sort | tail -1)")"
fi

rm -f "${OUT}"/*.app
"${RUN[@]}" \
  /project:"${HERE}" \
  /packagecachepath:"${CACHE}" \
  /outfolder:"${OUT}" \
  /analyzer:"${ANALYZERS}/Microsoft.Dynamics.Nav.CodeCop.dll" \
  /analyzer:"${ANALYZERS}/Microsoft.Dynamics.Nav.PerTenantExtensionCop.dll" \
  /analyzer:"${ANALYZERS}/Microsoft.Dynamics.Nav.UICop.dll" \
  /warnaserror+ \
  "$@"

ls -1 "${OUT}"/*.app
