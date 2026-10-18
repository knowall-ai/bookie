#!/usr/bin/env bash
# Compile the Bookie Business Central extension (one app: src/core and src/bitcoin) on
# Linux or macOS, without Docker or a BC server, with CodeCop, PerTenantExtensionCop
# and UICop, warnings as errors.
#
#   bc-extension/build.sh                    # output/KnowAll_Bookie_<version>.app
#   SYMBOLS=sandbox bc-extension/build.sh    # symbols from your BC Sandbox instead
#
# The AL compiler comes from either:
#   - the cross-platform dotnet tool (what CI uses):
#       dotnet tool install --global Microsoft.Dynamics.BusinessCentral.Development.Tools
#     which puts `al` on the PATH; or
#   - any alc.dll, such as the AL Language VS Code extension's (ms-dynamics-smb.al): set
#     ALC_DLL (found under ~/.vscode/extensions otherwise), run with DOTNET (default: dotnet
#     on the PATH, else ~/.dotnet/dotnet).
# AL_COMPILER=tool|vscode picks one; by default the dotnet tool wins when `al` is found
# and ALC_DLL isn't set.
#
# Symbols (SYMBOLS):
#   public  (default) Microsoft's public MSSymbols NuGet feed (the feed AL-Go uses), no sign-in.
#   sandbox your environment's dev endpoint, signed in with `az login`: BC_TENANT_ID (default:
#           the Azure CLI's tenant; never written to the repo), BC_ENVIRONMENT (default:
#           Sandbox), BC_RUNTIME (default 27.0.0.0, app.json's application version).
# Symbols are cached in bc-extension/.alpackages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CACHE="$ROOT/.alpackages"
OUT="$ROOT/output"
SYMBOLS="${SYMBOLS:-public}"
BC_VERSION="${BC_SYMBOLS_VERSION:-27.0.38460.40293}"
PLATFORM_VERSION="${BC_PLATFORM_VERSION:-27.0.40210}"
FEED="https://dynamicssmb2.pkgs.visualstudio.com/571e802d-b44b-45fc-bd41-4cfddec73b44/_packaging/b656b10c-3de0-440c-900c-bc2e4e86d84c/nuget/v3/flat2"

compiler="${AL_COMPILER:-}"
if [[ -z "$compiler" ]]; then
  if [[ -z "${ALC_DLL:-}" ]] && command -v al >/dev/null 2>&1; then compiler=tool; else compiler=vscode; fi
fi

if [[ "$compiler" == tool ]]; then
  AL_BIN="$(command -v al)"
  STORE="$(dirname "$(readlink -f "$AL_BIN")")/.store"
  ANALYZERS="$(dirname "$(find "$STORE" -name Microsoft.Dynamics.Nav.CodeCop.dll | sort | tail -1)")"
  RUN=("$AL_BIN" compile)
else
  DOTNET="${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}"
  ALC_DLL="${ALC_DLL:-$(ls -d "$HOME"/.vscode/extensions/ms-dynamics-smb.al-*/bin/alc.dll 2>/dev/null | sort -V | tail -1)}"
  if [[ -z "$ALC_DLL" || ! -f "$ALC_DLL" ]]; then
    echo "AL compiler not found: install the dotnet tool or the AL Language extension, or set ALC_DLL." >&2
    exit 1
  fi
  ANALYZERS="$(dirname "$(find "$(dirname "$ALC_DLL")" -name Microsoft.Dynamics.Nav.CodeCop.dll | sort | tail -1)")"
  RUN=("$DOTNET" "$ALC_DLL")
fi

mkdir -p "$CACHE" "$OUT"

if [[ "$SYMBOLS" == public ]]; then
  fetch() { # package-id version
    local id="$1" version="$2" tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/pkg.nupkg" "$FEED/$id/$version/$id.$version.nupkg"
    unzip -o -j -q "$tmp/pkg.nupkg" '*.app' -d "$CACHE"
    rm -rf "$tmp"
  }
  if [[ ! -f "$CACHE/.symbols-$BC_VERSION" ]]; then
    echo "Downloading BC $BC_VERSION symbols..."
    fetch microsoft.platform.symbols "$PLATFORM_VERSION"
    fetch microsoft.systemapplication.symbols.63ca2fa4-4f03-4f2b-a480-172fef340d3f "$BC_VERSION"
    fetch microsoft.businessfoundation.symbols.f3552374-a1f2-4356-848e-196002525837 "$BC_VERSION"
    fetch microsoft.baseapplication.symbols.437dbf0e-84ff-417a-965d-ed2bb9650972 "$BC_VERSION"
    fetch microsoft.application.symbols "$BC_VERSION"
    touch "$CACHE/.symbols-$BC_VERSION"
  fi
elif [[ "$SYMBOLS" == sandbox ]]; then
  TENANT="${BC_TENANT_ID:-$(az account show --query tenantId -o tsv)}"
  ENVIRONMENT="${BC_ENVIRONMENT:-Sandbox}"
  RUNTIME="${BC_RUNTIME:-27.0.0.0}"
  TOKEN="$(az account get-access-token --resource https://api.businesscentral.dynamics.com --query accessToken -o tsv)"
  for app in "System" "System Application" "Base Application" "Application"; do
    file="$CACHE/Microsoft_${app// /_}.app"
    [[ -s "$file" ]] && continue
    echo "Downloading symbols: $app"
    curl -fsS -G -o "$file" -H "Authorization: Bearer $TOKEN" \
      --data-urlencode "publisher=Microsoft" --data-urlencode "appName=$app" \
      --data-urlencode "versionText=$RUNTIME" \
      "https://api.businesscentral.dynamics.com/v2.0/$TENANT/$ENVIRONMENT/dev/packages"
  done
else
  echo "SYMBOLS must be public or sandbox." >&2
  exit 1
fi

rm -f "$OUT"/*.app
"${RUN[@]}" \
  /project:"$ROOT" \
  /packagecachepath:"$CACHE" \
  /outfolder:"$OUT" \
  /analyzer:"$ANALYZERS/Microsoft.Dynamics.Nav.CodeCop.dll" \
  /analyzer:"$ANALYZERS/Microsoft.Dynamics.Nav.PerTenantExtensionCop.dll" \
  /analyzer:"$ANALYZERS/Microsoft.Dynamics.Nav.UICop.dll" \
  /warnaserror+ \
  "$@"

ls -1 "$OUT"/*.app
