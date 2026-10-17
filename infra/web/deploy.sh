#!/usr/bin/env bash
# Build Bookie's web app from a clean checkout of a git ref and deploy it to Azure App Service.
#   infra/web/deploy.sh [ref]          (default: origin/main)
# Env: APP (bookie-knowall), RG (ka-bookie-prod), PUBLIC_URL (https://bookie.knowall.ai), AGENT_UPN.
# A clean worktree means no local .env files can leak into the bundle.
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
(cd "$S" && zip -qr "$ZIP" . -x "*.map")
echo "==> Deploying $(du -h "$ZIP" | cut -f1) to $APP"
BEFORE="$(az webapp log deployment list -n "$APP" -g "$RG" --query '[0].id' -o tsv 2>/dev/null || true)"
az webapp deploy -n "$APP" -g "$RG" --src-path "$ZIP" --type zip --restart true --async true -o none
for _ in $(seq 1 90); do
  LATEST="$(az webapp log deployment list -n "$APP" -g "$RG" --query '[0].[id,status]' -o tsv 2>/dev/null || true)"
  if [ -n "$LATEST" ] && [ "${LATEST%%$'\t'*}" != "$BEFORE" ]; then
    case "${LATEST##*$'\t'}" in 4) echo "==> Deployed $SHA"; break ;; 3) echo "Deployment failed" >&2; exit 1 ;; esac
  fi
  sleep 10
done
until curl -fs -o /dev/null -m 20 "$PUBLIC_URL/"; do sleep 10; done
echo "==> $PUBLIC_URL is up ($SHA)"
