#!/usr/bin/env bash
# =============================================================================
# Step 03: host software (Edge, Node.js, Docker, media stack, Azure CLI)
# Runs: ON the VM as the admin user. Idempotent (apt and the repo files are re-written in place).
# =============================================================================
# Hermes itself is installed by step 04, Presence by 23, Reverie by 40, the BC MCP by 41.
# Media prerequisites follow agent-presence's README "Host prerequisites": v4l2loopback via
# DKMS needs linux-modules-extra on Azure kernels; the avatar renderer wants the distro
# python3-pil / python3-numpy (newer Pillow blends alpha differently).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm

NODE_MAJOR="${NODE_MAJOR:-22}"   # same as Poppie's VM; Presence's CLIs are tested on 22

step "Step 03: base packages"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg git jq unzip rsync gettext-base openssl \
  python3 python3-venv python3-pip python3-pil python3-numpy ffmpeg \
  pulseaudio-utils v4l-utils "linux-modules-extra-$(uname -r)" \
  xdotool wmctrl poppler-utils file

step "Microsoft Edge"
if ! command -v microsoft-edge >/dev/null; then
  curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /usr/share/keyrings/microsoft-edge.gpg >/dev/null
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-edge.gpg] https://packages.microsoft.com/repos/edge stable main" \
    | sudo tee /etc/apt/sources.list.d/microsoft-edge.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y microsoft-edge-stable
else
  info "already installed: $(microsoft-edge --version)"
fi

step "Node.js ${NODE_MAJOR}"
if ! node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  info "already installed: $(node --version)"
fi

step "Docker Engine + compose (LiveKit server and the voice agent container; Neo4j for Reverie)"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "${AGENT_NAME}"
sudo systemctl enable --now docker
docker compose version >/dev/null 2>&1 || sudo docker compose version >/dev/null || die "docker compose v2 missing"

step "Azure CLI (managed-identity checks and token tests on the VM)"
if ! command -v az >/dev/null; then
  curl -fsSL https://aka.ms/InstallAzureCLIDeb | sudo bash
else
  info "already installed"
fi

step "v4l2loopback (upstream ${V4L2LOOPBACK_VERSION:-0.15.3} via DKMS, as Poppie and Sallie; Ubuntu 22.04's 0.12.7 does not build on Azure 6.8 kernels)"
V4L2_VER="${V4L2LOOPBACK_VERSION:-0.15.3}"
# 0.15.x and its v4l2loopback-ctl are required: pulse-setup pins YU12 1920x1080 with `set-caps` at boot.
# On 0.13.2 a reader (PipeWire's camera probe) could pin BGR4 640x480 first, and the avatar camera then
# failed on every call after a reboot (VIDIOC_S_FMT: Device or resource busy).
if ! sudo dkms status -m v4l2loopback -v "${V4L2_VER}" 2>/dev/null | grep -q installed; then
  dpkg -s v4l2loopback-dkms >/dev/null 2>&1 && sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y --purge v4l2loopback-dkms
  tmpdir="$(mktemp -d)"
  git clone -q --depth 1 --branch "v${V4L2_VER}" https://github.com/umlaeute/v4l2loopback.git "${tmpdir}/v4l2loopback"
  sudo rm -rf "/usr/src/v4l2loopback-${V4L2_VER}" && sudo cp -r "${tmpdir}/v4l2loopback" "/usr/src/v4l2loopback-${V4L2_VER}"
  sudo dkms add -m v4l2loopback -v "${V4L2_VER}" 2>/dev/null || true
  sudo dkms install -m v4l2loopback -v "${V4L2_VER}"
  rm -rf "${tmpdir}"
fi

step "v4l2loopback-ctl ${V4L2_VER} and the format udev rule"
[ -d "/usr/src/v4l2loopback-${V4L2_VER}" ] && (cd "/usr/src/v4l2loopback-${V4L2_VER}" && sudo make -s install-utils >/dev/null)
command -v v4l2loopback-ctl >/dev/null || die "v4l2loopback-ctl not installed (pulse-setup needs it to pin the camera format)"
# set-caps' fps step writes the sysfs `format` attribute, root-only by default, and pulse-setup runs it as the
# agent user. Match on that attribute: loopback devices have no parent, so DRIVERS=="v4l2 loopback" never
# matches (agent-presence#346; verified on ka-bookie-vm with udevadm test --action=add and a fresh modprobe).
sudo tee /etc/udev/rules.d/60-v4l2loopback.rules >/dev/null <<'UDEV'
# v4l2loopback devices: let group video write the sysfs format attribute (v4l2loopback-ctl set-caps' fps step)
ACTION=="add", SUBSYSTEM=="video4linux", TEST=="format", RUN+="/bin/chgrp video /sys%p/format", RUN+="/bin/chmod g+w /sys%p/format"
UDEV
sudo udevadm control --reload

step "v4l2loopback loads at boot"
echo "v4l2loopback" | sudo tee /etc/modules-load.d/v4l2loopback.conf >/dev/null
modinfo v4l2loopback >/dev/null || die "v4l2loopback module not built for $(uname -r)"

cat <<EOF

==> Versions
    Edge:    $(microsoft-edge --version 2>/dev/null || echo missing)
    Node:    $(node --version 2>/dev/null || echo missing)
    Docker:  $(docker --version 2>/dev/null || echo missing)
    az:      $(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo missing)
Next: 04-configure-hermes.sh
EOF
