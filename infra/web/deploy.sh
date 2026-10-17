#!/usr/bin/env bash
# Build Bookie's web app from a clean checkout of a git ref and deploy it to Azure App Service.
#   infra/web/deploy.sh [ref]          (default: origin/main)
# Env: APP (bookie-knowall), RG (ka-bookie-prod), PUBLIC_URL (https://bookie.knowall.ai), AGENT_UPN.
# A clean worktree means no local .env files can leak into the bundle.
# Needs git, bun, zip, curl and a signed-in az. Runs locally and in GitHub Actions
# (.github/workflows/deploy-production.yml: full-history checkout, az via OIDC), where it
# also writes the deployed build to the job summary.
set -euo pipefail
REF="${1:-origin/main}"
APP="${APP:-bookie-knowall}"; RG="${RG:-ka-bookie-prod}"
PUBLIC_URL="${PUBLIC_URL:-https://bookie.knowall.ai}"; AGENT_UPN="${AGENT_UPN:-bookie@knowall.ai}"
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
BUILD="$(mktemp -d)/bookie-build"; ZIP="$(mktemp -d)/bookie-web.zip"
trap 'git -C "$REPO" worktree remove --force "$BUILD" >/dev/null 2>&1 || true' EXIT

git -C "$REPO" fetch -q origin
git -C "$REPO" worktree add -q --detach "$BUILD" "$REF"
SHA="$(git -C "$BUILD" rev-parse --short HEAD)"
echo "==> Building $SHA"
cd "$BUILD/web"
bun install --frozen-lockfile >/dev/null
NEXT_PUBLIC_BOOKIE_AGENT_UPN="$AGENT_UPN" NEXTAUTH_URL="$PUBLIC_URL" bun run build >/dev/null
S=.next/standalone
cp -r public "$S/" && mkdir -p "$S/.next" && cp -r .next/static "$S/.next/"
# Zip timestamps in UTC: App Service reads them as UTC, and local time put files in the future.
(cd "$S" && TZ=UTC zip -qr "$ZIP" . -x "*.map")
BUILD_ID="$(cat .next/BUILD_ID)"
echo "==> Deploying $(du -h "$ZIP" | cut -f1) to $APP"
# --clean removes files the zip doesn't have, notably Next's runtime page cache
# (.next/server/route-cache), which otherwise keeps serving the previous build's pages.
az webapp deploy -n "$APP" -g "$RG" --src-path "$ZIP" --type zip --clean true --restart true -o none
# Done when the live site serves this build, not merely when Azure says the deploy finished.
for _ in $(seq 1 60); do
  # Read the whole page first: with pipefail, `curl | grep -q` fails when grep stops early.
  PAGE="$(curl -fs -m 20 "$PUBLIC_URL/" || true)"
  if grep -qF "$BUILD_ID" <<<"$PAGE"; then
    echo "==> $PUBLIC_URL is up ($SHA)"
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      echo "Deployed \`$SHA\` (build \`$BUILD_ID\`) to $PUBLIC_URL" >>"$GITHUB_STEP_SUMMARY"
    fi
    exit 0
  fi
  sleep 10
done
echo "$PUBLIC_URL is not serving build $BUILD_ID ($SHA) after 10 minutes" >&2
exit 1
