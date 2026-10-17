#!/usr/bin/env bash
# =============================================================================
# accounts-inbox-gate.sh: pre-run script for the `bill-capture` Hermes cron job.
#
# Lists the newest messages in the shared accounts mailbox's Inbox (ACCOUNTS_MAILBOX) with
# Presence's graph.mjs, as Bookie (delegated; FullAccess from deploy/10), and prints the ids
# of messages it has not seen before. Its stdout is injected into the cron prompt; when the
# LAST line is {"wakeAgent": false} Hermes skips the agent turn, so an empty poll costs no
# model call (same contract as Poppie's timesheet-review gate).
#
# Processed bills are moved out of the Inbox by the bill-capture skill; anything left there
# (not a bill, or waiting for a person) is remembered in the seen-list so it never wakes
# Bookie twice. The seen-list holds Graph message ids only: no content, no amounts.
#
# Hermes only runs cron scripts from ~/.hermes/scripts, so step 04 COPIES this file there.
# Hermes strips secrets from a cron script's environment, so this re-loads them with
# ~/presence/scripts/env.sh. A failure wakes Bookie once per BILL_GATE_ERROR_EVERY_MIN.
# =============================================================================
set -uo pipefail

PRESENCE_DIR="${PRESENCE_DIR:-${HOME}/presence}"
# shellcheck disable=SC1091
source "${PRESENCE_DIR}/scripts/env.sh" >/dev/null 2>&1 || true
STATE_DIR="${BILL_GATE_STATE_DIR:-${HOME}/.hermes/bill-capture}"
SEEN="${STATE_DIR}/seen-ids"
ERR_MARK="${STATE_DIR}/last-error"
ERROR_EVERY_MIN="${BILL_GATE_ERROR_EVERY_MIN:-120}"
TOP="${BILL_GATE_TOP:-15}"
mkdir -p "${STATE_DIR}" && chmod 700 "${STATE_DIR}"
touch "${SEEN}"

skip() { echo '{"wakeAgent": false}'; exit 0; }

if [ -z "${ACCOUNTS_MAILBOX:-}" ]; then
  echo "ACCOUNTS_MAILBOX not set; bill capture is off"; skip
fi

OUT="$(MS365_USER_ID="${ACCOUNTS_MAILBOX}" node "${PRESENCE_DIR}/scripts/graph.mjs" list-mail --folder Inbox --top "${TOP}" 2>&1)"
RC=$?
if [ "${RC}" -ne 0 ]; then
  # Wake once (so Bookie can tell someone), then stay quiet for a while.
  if [ -f "${ERR_MARK}" ] && [ $(( $(date +%s) - $(stat -c %Y "${ERR_MARK}") )) -lt $(( ERROR_EVERY_MIN * 60 )) ]; then
    skip
  fi
  touch "${ERR_MARK}"
  echo "bill-capture gate: could not list ${ACCOUNTS_MAILBOX} Inbox (exit ${RC}). First lines:"
  printf '%s\n' "${OUT}" | head -5
  echo "Tell the accountant that bill capture is not reading the mailbox; do not retry by hand."
  exit 0
fi
rm -f "${ERR_MARK}"

NEW="$(printf '%s' "${OUT}" | python3 -c '
import json, sys
seen = set(open(sys.argv[1]).read().split())
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
msgs = data.get("value", data) if isinstance(data, dict) else data
for m in msgs or []:
    mid = m.get("id")
    if mid and mid not in seen:
        has = "attachments" if m.get("hasAttachments") else "no attachments"
        print(f"{mid}\t{has}")
' "${SEEN}")"

if [ -z "${NEW}" ]; then skip; fi

cut -f1 <<<"${NEW}" >> "${SEEN}"
tail -n 2000 "${SEEN}" > "${SEEN}.tmp" && mv "${SEEN}.tmp" "${SEEN}"
echo "New messages in ${ACCOUNTS_MAILBOX} Inbox (Graph message id, attachments):"
printf '%s\n' "${NEW}"
