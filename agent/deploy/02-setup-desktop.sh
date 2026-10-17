#!/usr/bin/env bash
# =============================================================================
# Step 02: Kubuntu desktop + xRDP + the agent's unix user
# Runs: ON the VM as the admin user. Idempotent. Reboots at the end (REBOOT=0 to skip).
# =============================================================================
# Why a desktop: Agent Presence joins Teams with a real Microsoft Edge on DISPLAY=:0
# (teams-presence.js), feeds it a virtual camera (v4l2loopback) and virtual microphone
# (PulseAudio/PipeWire). The admin uses RDP to watch or fix that browser.
# SDDM autologin of the agent user gives Edge a display :0 after every reboot.
# =============================================================================
set -euo pipefail
ALLOW_NO_AGENT_USER=1
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on vm

step "Step 02: desktop on $(hostname)"

step "System packages"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

if dpkg -s kubuntu-desktop >/dev/null 2>&1; then
  info "kubuntu-desktop already installed"
else
  step "Installing Kubuntu desktop (takes a while)"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y kubuntu-desktop
fi

step "xRDP"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y xrdp
sudo systemctl enable --now xrdp
echo "startplasma-x11" > "${HOME}/.xsession"
chmod +x "${HOME}/.xsession"
sudo tee /etc/xrdp/startwm.sh >/dev/null <<'XRDP'
#!/bin/sh
if [ -r /etc/default/locale ]; then
  . /etc/default/locale
  export LANG LANGUAGE
fi
export XDG_SESSION_TYPE=x11
exec startplasma-x11
XRDP
sudo chmod +x /etc/xrdp/startwm.sh

step "Admin password for RDP (${VM_ADMIN_USER})"
if [ "$(sudo passwd -S "${VM_ADMIN_USER}" | awk '{print $2}')" = "P" ]; then
  info "already set; skipping (sudo passwd ${VM_ADMIN_USER} to change it)"
else
  sudo passwd "${VM_ADMIN_USER}"
fi

step "Unix user '${AGENT_NAME}' (runs Hermes, Presence and Reverie; no password, no sudo)"
if id "${AGENT_NAME}" >/dev/null 2>&1; then
  info "exists"
else
  sudo adduser --gecos "${AGENT_DISPLAY_NAME},,," --disabled-password "${AGENT_NAME}"
fi
# Audio/video devices for the Presence bridge; journal read for the HUD's deep-brain feed.
for g in audio video systemd-journal; do sudo usermod -aG "${g}" "${AGENT_NAME}"; done
sudo loginctl enable-linger "${AGENT_NAME}"   # keeps /run/user/<uid> (PulseAudio socket) without a login

step "SDDM autologin for ${AGENT_NAME} (display :0 for Edge)"
sudo mkdir -p /etc/sddm.conf.d
sudo tee /etc/sddm.conf.d/10-autologin-${AGENT_NAME}.conf >/dev/null <<EOF
[Autologin]
User=${AGENT_NAME}
Session=plasma
Relogin=true
EOF

echo
echo "==> Desktop ready. RDP to the VM as ${VM_ADMIN_USER} once step 12 has locked 3389 to your IP."
step "No lock screen or screen blanking for ${AGENT_NAME}"
# Nobody sits at this desktop, and on a VM with no GPU KDE's lock screen is drawn in software: it
# kept Xorg at ~30% CPU around the clock and starved PulseAudio, so Bookie's call audio stuttered.
sudo -u "${AGENT_NAME}" mkdir -p "/home/${AGENT_NAME}/.config"
sudo -u "${AGENT_NAME}" tee "/home/${AGENT_NAME}/.config/kscreenlockerrc" >/dev/null <<'KSL'
[Daemon]
Autolock=false
LockOnResume=false
Timeout=0
KSL
sudo -u "${AGENT_NAME}" tee "/home/${AGENT_NAME}/.config/powermanagementprofilesrc" >/dev/null <<'PM'
[AC][DPMSControl]
idleTime=0
lockBeforeTurnOff=0

[AC][SuspendSession]
idleTime=0
suspendType=0
PM

if [ "${REBOOT:-1}" = 1 ]; then
  echo "==> Rebooting in 5 seconds (REBOOT=0 to skip)..."
  sleep 5
  sudo reboot
fi
