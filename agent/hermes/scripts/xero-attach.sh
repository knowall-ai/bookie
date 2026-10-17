#!/usr/bin/env bash
# =============================================================================
# xero-attach.sh: upload a file to a Xero bill as an attachment (Xero Attachments API).
# xero.sh always sends Content-Type: application/json, but an attachment is a raw binary body
# with the file's own MIME type, so this small helper does that one call. It reuses xero.sh's
# credentials files and token cache (~/.config/xero/credentials[.<key>], ~/.cache/xero/<key>/).
#
# Usage: XERO_COMPANY=uk xero-attach.sh <InvoiceID> <file> [mime-type]
#   PUT https://api.xero.com/api.xro/2.0/Invoices/<InvoiceID>/Attachments/<filename>
# Prints only Xero's JSON response. Never prints the token or secret.
# Needs the accounting.attachments scope on the Custom Connection (step 42).
# =============================================================================
set -euo pipefail

INVOICE_ID="${1:?usage: xero-attach.sh <InvoiceID> <file> [mime-type]}"
FILE="${2:?usage: xero-attach.sh <InvoiceID> <file> [mime-type]}"
[[ "${INVOICE_ID}" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "ERROR: InvoiceID must be a GUID" >&2; exit 2; }
[ -r "${FILE}" ] || { echo "ERROR: cannot read ${FILE}" >&2; exit 2; }
MIME="${3:-$(file --brief --mime-type "${FILE}")}"
case "${MIME}" in
  application/pdf|image/png|image/jpeg|image/gif|image/tiff|text/html|application/xml|text/xml) ;;
  *) echo "ERROR: refusing to attach a ${MIME} file" >&2; exit 2 ;;
esac
SIZE="$(stat -c %s "${FILE}")"
[ "${SIZE}" -le $((25 * 1024 * 1024)) ] || { echo "ERROR: ${FILE} is over Xero's 25 MB limit" >&2; exit 2; }

COMPANY="${XERO_COMPANY:-uk}"
if [ "${COMPANY}" = uk ]; then CRED="${HOME}/.config/xero/credentials"; else CRED="${HOME}/.config/xero/credentials.${COMPANY}"; fi
CRED="${XERO_CREDENTIALS:-${CRED}}"
CACHE="${HOME}/.cache/xero/${COMPANY}"
[ -r "${CRED}" ] || { echo "ERROR: no Xero credentials for '${COMPANY}' at ${CRED}" >&2; exit 2; }

# Token and tenant: let xero.sh mint/cache them (a cheap read), then read its cache. xero.sh's token
# cache is not keyed by scope, so drop it first (a cached read-only token cannot write) and again at
# the end, so later reads go back to a read-only token.
XERO_SH="${XERO_SH:-${HOME}/.claude/plugins/marketplaces/knowall-ai/skills/xero/xero.sh}"
rm -f "${CACHE}/token"
trap 'rm -f "${CACHE}/token"' EXIT
XERO_SCOPE="${XERO_SCOPE_WRITE:-accounting.transactions accounting.attachments accounting.settings.read}" \
  XERO_COMPANY="${COMPANY}" "${XERO_SH}" GET "Organisation" >/dev/null
TOKEN="$(sed -n '1p' "${CACHE}/token")"
TENANT="$(cat "${CACHE}/tenant")"
[ -n "${TOKEN}" ] && [ -n "${TENANT}" ] || { echo "ERROR: no cached Xero token/tenant for '${COMPANY}'" >&2; exit 3; }

NAME="$(basename "${FILE}" | tr -c 'A-Za-z0-9._-' '_' )"
curl -sS -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Xero-tenant-id: ${TENANT}" \
  -H "Accept: application/json" \
  -H "Content-Type: ${MIME}" \
  --data-binary "@${FILE}" \
  "https://api.xero.com/api.xro/2.0/Invoices/${INVOICE_ID}/Attachments/${NAME}"
