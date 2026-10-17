# =============================================================================
# Step 8: Restrict Email - Exchange Transport Rules
# Runs: Windows PowerShell (Exchange Online Management module)
# =============================================================================
# This script creates transport rules that prevent AI agents from sending or
# receiving external email. The rules apply to all members of the "AI Agents"
# security group.
#
# For Bookie this is a feature, not a limit: payment-chasing emails to customers are
# drafts a person sends from their own mailbox (cash-advice skill), never sends by Bookie.
# Supplier invoices still reach the shared mailbox accounts@ (not a group member);
# Bookie reads them there through the FullAccess grant of step 10.
# Adapted for Bookie from knowall-ai/poppie-hermes. Idempotent (existing rules/policies are kept).
# =============================================================================

param(
    [string]$ConfigFile = "$PSScriptRoot/config.env"
)

# Parse config.env for needed values
function Get-ConfigValue {
    param([string]$Key, [string]$File)
    $line = Get-Content $File | Where-Object { $_ -match "^${Key}=" } | Select-Object -First 1
    if ($line) {
        return (($line -split '=', 2)[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'")
    }
    return $null
}

$SecurityGroup   = Get-ConfigValue -Key "SECURITY_GROUP" -File $ConfigFile
$AdminUPN        = $env:M365_ADMIN_UPN
if (-not $AdminUPN) { $AdminUPN = Read-Host "Exchange admin UPN" }
$InternalDomain  = Get-ConfigValue -Key "M365_DOMAIN" -File $ConfigFile

# Fallback to extracting domain from admin UPN if M365_DOMAIN not set
if (-not $InternalDomain -and $AdminUPN) {
    $InternalDomain = $AdminUPN.Split('@')[1]
}

Write-Host "==> Step 8: Restricting email for '$SecurityGroup' group members" -ForegroundColor Cyan

# Install the module if not already installed
if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Write-Host "==> Installing ExchangeOnlineManagement module..."
    Install-Module ExchangeOnlineManagement -Force -Scope CurrentUser
}

# Connect to Exchange Online
Write-Host "==> Connecting to Exchange Online as $AdminUPN..."
Connect-ExchangeOnline -UserPrincipalName $AdminUPN

try {
    # Block OUTBOUND external email from AI Agents
    $outboundRule = "Block AI Agents External Outbound"
    $existingOutbound = Get-TransportRule -Identity $outboundRule -ErrorAction SilentlyContinue
    if ($existingOutbound) {
        Write-Host "    Rule '$outboundRule' already exists. Skipping."
    } else {
        Write-Host "==> Creating transport rule: $outboundRule"
        New-TransportRule -Name $outboundRule `
            -FromMemberOf $SecurityGroup `
            -SentToScope NotInOrganization `
            -RejectMessageReasonText "AI agents are not permitted to send external email." `
            -Priority 0
    }

    # Block INBOUND external email TO AI Agents
    # Exception: Allow internal users to forward external emails to AI agents
    # (When a colleague forwards an external email, the original external sender triggers the rule,
    # but the -ExceptIfSenderDomainIs exception allows it because the forwarder is internal)
    $inboundRule = "Block AI Agents External Inbound"
    $existingInbound = Get-TransportRule -Identity $inboundRule -ErrorAction SilentlyContinue
    if ($existingInbound) {
        Write-Host "    Rule '$inboundRule' already exists. Updating exception for internal forwarding..."
        Set-TransportRule -Identity $inboundRule `
            -ExceptIfSenderDomainIs $InternalDomain
    } else {
        Write-Host "==> Creating transport rule: $inboundRule"
        Write-Host "    (with exception for forwarded emails from $InternalDomain)"
        New-TransportRule -Name $inboundRule `
            -SentToMemberOf $SecurityGroup `
            -FromScope NotInOrganization `
            -ExceptIfSenderDomainIs $InternalDomain `
            -RejectMessageReasonText "External email to AI agents is not permitted." `
            -Priority 1
    }

    # Verify rules
    Write-Host ""
    Write-Host "==> Transport rules for AI Agents:" -ForegroundColor Green
    Get-TransportRule | Where-Object { $_.Name -like "*AI Agents*" } | Format-List Name, State, Priority

} finally {
    # Disconnect
    Write-Host "==> Disconnecting from Exchange Online..."
    Disconnect-ExchangeOnline -Confirm:$false
}

Write-Host ""
Write-Host "==> Next: Run 09-restrict-teams.ps1 from this same machine."
