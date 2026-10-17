#!/usr/bin/env bash
# =============================================================================
# Step 11: Caddy reverse proxy with Let's Encrypt for the Graph webhook host
# Runs: ON the VM as the admin user. Idempotent.
# HUMAN PREREQUISITE: DNS A record ${PUBLIC_DOMAIN} -> the VM's public IP (step 01 printed it).
# The only public route is /webhooks/* -> the Presence Graph adapter on loopback.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm
require PUBLIC_DOMAIN GRAPH_ADAPTER_PORT

step "Step 11: Caddy for ${PUBLIC_DOMAIN}"
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update && sudo apt-get install -y caddy
else
  info "caddy installed: $(caddy version | head -1)"
fi

DNS_IP="$(getent hosts "${PUBLIC_DOMAIN}" | awk '{print $1}' | head -1 || true)"
MY_IP="$(curl -s --max-time 5 https://ifconfig.me || true)"
if [ -z "${DNS_IP}" ] || [ "${DNS_IP}" != "${MY_IP}" ]; then
  warn "${PUBLIC_DOMAIN} resolves to '${DNS_IP:-nothing}', this VM is '${MY_IP:-unknown}'. Caddy cannot get a certificate until DNS points here."
fi

tmp="$(mktemp)"
render_template "${AGENT_DIR}/config/caddy/Caddyfile.template" PUBLIC_DOMAIN GRAPH_ADAPTER_PORT ACME_EMAIL > "${tmp}"
# No contact address configured: drop the global email block instead of writing an empty one.
[ -n "${ACME_EMAIL:-}" ] || sed -i '/^{$/,/^}$/d' "${tmp}"
caddy validate --adapter caddyfile --config "${tmp}" >/dev/null || { rm -f "${tmp}"; die "rendered Caddyfile is invalid"; }
if sudo cmp -s "${tmp}" /etc/caddy/Caddyfile; then
  info "Caddyfile unchanged"
else
  sudo install -m 644 "${tmp}" /etc/caddy/Caddyfile
  info "Caddyfile installed"
fi
rm -f "${tmp}"
sudo systemctl enable caddy >/dev/null
sudo systemctl reload-or-restart caddy

cat <<EOF

==> Step 11 done.
    Webhook URL:  https://${PUBLIC_DOMAIN}/webhooks/graph  ->  127.0.0.1:${GRAPH_ADAPTER_PORT}
    Test (after step 21): curl -s 'https://${PUBLIC_DOMAIN}/webhooks/graph?validationToken=ping'  # prints ping
Next: 12-lockdown-nsg.sh from your workstation.
EOF
