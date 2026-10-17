#!/usr/bin/env bash
# =============================================================================
# Step 13: Bookie's own Azure OpenAI resource and model deployments
# Runs: locally (Azure CLI). Idempotent: existing resource/deployments/role assignments are kept.
# =============================================================================
# ${AI_RESOURCE_NAME} (${AI_LOCATION}) holds:
#   ${AI_BRAIN_DEPLOYMENT}     the brain (Hermes model + vision; also the gpt-live tool backend)
#   ${AI_REALTIME_DEPLOYMENT}  the voice rollback (gpt-realtime-2.1)
#   ${AI_LIVE_DEPLOYMENT}      GPT-Live-1, created only when AI_LIVE_MODEL_VERSION is set and the
#                              subscription has gpt-live-1 quota in ${AI_LOCATION}.
# HUMAN CHECK: quota. KnowAll's subscription currently has its whole gpt-live-1 quota on another
# agent's resource; request quota for this one in the Azure AI Foundry portal (Quotas), and until
# it is granted set LIVE_RESOURCE_ID + AZURE_LIVE_ENDPOINT to the resource that has it. This step
# then grants the VM identity Cognitive Services OpenAI User there too.
# Model versions are not hard-coded (they change): list them with
#   az cognitiveservices account list-models -g ${AI_RESOURCE_GROUP} -n ${AI_RESOURCE_NAME} -o table
# and set AI_*_MODEL_VERSION. A deployment with no version set is skipped with a message.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
must_run_on local
require AI_RESOURCE_GROUP AI_RESOURCE_NAME AI_LOCATION RESOURCE_GROUP VM_NAME

read -r -a TAGS <<< "${VM_TAGS}"

step "Step 13: Azure AI resource ${AI_RESOURCE_NAME} in ${AI_LOCATION}"
az group show -n "${AI_RESOURCE_GROUP}" -o none 2>/dev/null || az group create -n "${AI_RESOURCE_GROUP}" -l "${VM_LOCATION}" -o none
if az cognitiveservices account show -g "${AI_RESOURCE_GROUP}" -n "${AI_RESOURCE_NAME}" -o none 2>/dev/null; then
  info "exists"
else
  az cognitiveservices account create -g "${AI_RESOURCE_GROUP}" -n "${AI_RESOURCE_NAME}" \
    --kind AIServices --sku "${AI_SKU}" --location "${AI_LOCATION}" \
    --custom-domain "${AI_RESOURCE_NAME}" --tags "${TAGS[@]}" "presence-agent=${AGENT_NAME}" --yes -o none
  info "created"
fi
AI_ID="$(az cognitiveservices account show -g "${AI_RESOURCE_GROUP}" -n "${AI_RESOURCE_NAME}" --query id -o tsv)"

deploy() { # name model version capacity sku
  local name="$1" model="$2" version="$3" capacity="$4" sku="${5:-GlobalStandard}"
  if az cognitiveservices account deployment show -g "${AI_RESOURCE_GROUP}" -n "${AI_RESOURCE_NAME}" \
       --deployment-name "${name}" -o none 2>/dev/null; then
    info "deployment ${name}: exists"; return 0
  fi
  if [ -z "${version}" ]; then
    warn "deployment ${name}: skipped (set the model version for ${model} in config.env)"; return 0
  fi
  if az cognitiveservices account deployment create -g "${AI_RESOURCE_GROUP}" -n "${AI_RESOURCE_NAME}" \
       --deployment-name "${name}" --model-format OpenAI --model-name "${model}" --model-version "${version}" \
       --sku-name "${sku}" --sku-capacity "${capacity}" -o none; then
    info "deployment ${name}: created (${model} ${version}, ${sku} x${capacity})"
  else
    warn "deployment ${name}: failed (quota or region?). Request quota, then re-run."
  fi
}
step "Model deployments"
deploy "${AI_BRAIN_DEPLOYMENT}"    "${AI_BRAIN_MODEL}"    "${AI_BRAIN_MODEL_VERSION}"    "${AI_BRAIN_CAPACITY}"
deploy "${AI_REALTIME_DEPLOYMENT}" "${AI_REALTIME_MODEL}" "${AI_REALTIME_MODEL_VERSION}" "${AI_REALTIME_CAPACITY}"
deploy "${AI_LIVE_DEPLOYMENT}"     "${AI_LIVE_MODEL}"     "${AI_LIVE_MODEL_VERSION}"     "${AI_LIVE_CAPACITY}"

step "Role: the VM's managed identity -> Cognitive Services OpenAI User"
PRINCIPAL="$(az vm identity show -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --query principalId -o tsv 2>/dev/null || true)"
[ -n "${PRINCIPAL}" ] || die "VM ${VM_NAME} has no managed identity: run 01-create-vm.sh"
grant() { # scope label
  if [ -n "$(az role assignment list --assignee "${PRINCIPAL}" --scope "$1" --role "Cognitive Services OpenAI User" --query '[0].id' -o tsv)" ]; then
    info "$2: already granted"
  else
    az role assignment create --assignee-object-id "${PRINCIPAL}" --assignee-principal-type ServicePrincipal \
      --role "Cognitive Services OpenAI User" --scope "$1" -o none
    info "$2: granted"
  fi
}
grant "${AI_ID}" "${AI_RESOURCE_NAME}"
if [ -n "${LIVE_RESOURCE_ID:-}" ]; then
  grant "${LIVE_RESOURCE_ID}" "borrowed gpt-live-1 resource"
  warn "voice is billed to the borrowed resource until AZURE_LIVE_ENDPOINT points back at ${AI_RESOURCE_NAME}"
fi

cat <<EOF

==> Step 13 done.
    Endpoint (Hermes):   https://${AI_RESOURCE_NAME}.cognitiveservices.azure.com/openai/v1
    Endpoint (voice):    https://${AI_RESOURCE_NAME}.openai.azure.com
    Resource id:         ${AI_ID}   (SPEND_AZURE_ACCOUNT_ID in the call-bot .env)
    The key for Hermes is fetched on the VM by step 04's prompt; never paste it into chat or git:
      az cognitiveservices account keys list -g ${AI_RESOURCE_GROUP} -n ${AI_RESOURCE_NAME} --query key1 -o tsv
HUMAN STEP: create a monthly Consumption budget (GBP ${AI_BUDGET_GBP}) filtered to this resource in
Cost Management, and put its id in SPEND_AZURE_BUDGET_ID (the Presence spend meter reads it).
EOF
