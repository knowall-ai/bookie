# =============================================================================
# Step 8: Check Email - Exchange Transport Rules (check only)
# Runs: Windows PowerShell (Exchange Online Management module)
# =============================================================================
# CHECK ONLY. Verifies the shared transport rules for the AI agents' external email and warns
# loudly if they are wrong; it never creates or changes anything. The rules are tenant-wide and
# owned by knowall-ai/sallie deploy/25-enable-email-moderation.ps1: "Moderate AI Agents External
# Outbound" holds external mail from every member of the "AI Agents" group until a moderator
# approves it (Outlook, or the Agents Portal's Approvals tab). EMAIL_MODERATORS lists who should be
# on it. Exits 1 if moderation isn't in force or the old block rule is back.
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
$Moderators      = @((Get-ConfigValue -Key "EMAIL_MODERATORS" -File $ConfigFile) -split '\s+' | Where-Object { $_ })
$AdminUPN        = $env:M365_ADMIN_UPN
if (-not $AdminUPN) { $AdminUPN = Read-Host "Exchange admin UPN" }
$InternalDomain  = Get-ConfigValue -Key "M365_DOMAIN" -File $ConfigFile

# Fallback to extracting domain from admin UPN if M365_DOMAIN not set
if (-not $InternalDomain -and $AdminUPN) {
    $InternalDomain = $AdminUPN.Split('@')[1]
}

Write-Host "==> Step 8: Checking email rules for '$SecurityGroup' group members" -ForegroundColor Cyan

# Install the module if not already installed
if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Write-Host "==> Installing ExchangeOnlineManagement module..."
    Install-Module ExchangeOnlineManagement -Force -Scope CurrentUser
}

# Connect to Exchange Online
Write-Host "==> Connecting to Exchange Online as $AdminUPN..."
# Linux and macOS have no embedded browser for the sign-in: use a device code there.
if ($IsWindows -or $PSVersionTable.PSEdition -eq 'Desktop') {
    Connect-ExchangeOnline -UserPrincipalName $AdminUPN
} else {
    Connect-ExchangeOnline -UserPrincipalName $AdminUPN -Device
}

try {
    # CHECK ONLY: this script never creates or changes a transport rule. The AI Agents rules are
    # tenant-wide and shared by every agent; knowall-ai/sallie deploy/25-enable-email-moderation.ps1
    # is their single owner. Two repos setting the same rule would drift (whichever ran last would
    # win), and re-creating the old block rules would stop every agent's external email.
    $outboundRule  = "Block AI Agents External Outbound"
    $inboundRule   = "Block AI Agents External Inbound"
    $moderatedRule = "Moderate AI Agents External Outbound"
    $problems = @()

    $moderated = Get-TransportRule -Identity $moderatedRule -ErrorAction SilentlyContinue
    if (-not $moderated) {
        $problems += "'$moderatedRule' is missing: Bookie's external email is not held for approval."
    } else {
        if ($moderated.State -ne 'Enabled') { $problems += "'$moderatedRule' is $($moderated.State), not Enabled." }
        if ("$($moderated.Mode)" -ne 'Enforce') { $problems += "'$moderatedRule' is in $($moderated.Mode) mode, not Enforce." }
        if ("$($moderated.SentToScope)" -ne 'NotInOrganization') { $problems += "'$moderatedRule' does not apply to recipients outside the organisation." }
        if (-not (@($moderated.FromMemberOf) | Where-Object { "$_" -like "*$SecurityGroup*" })) {
            $problems += "'$moderatedRule' does not apply to '$SecurityGroup'."
        }
        $actual = @($moderated.ModerateMessageByUser | ForEach-Object { "$_" })
        if ($actual.Count -eq 0) { $problems += "'$moderatedRule' has no moderators." }
        foreach ($m in $Moderators) {
            if (-not ($actual | Where-Object { $_ -ieq $m -or $m -ilike "$_@*" })) {
                $problems += "Expected moderator $m is not on '$moderatedRule' (has: $($actual -join ', '))."
            }
        }
        if (@($moderated.PSObject.Properties | Where-Object { $_.Name -like 'ExceptIf*' -and $_.Value }).Count) {
            $problems += "'$moderatedRule' has exceptions: some agents' external mail may skip approval."
        }
    }
    if (Get-TransportRule -Identity $outboundRule -ErrorAction SilentlyContinue) {
        $problems += "'$outboundRule' still exists: it rejects external mail that should be held for approval."
    }
    if (Get-TransportRule -Identity $inboundRule -ErrorAction SilentlyContinue) {
        Write-Warning "'$inboundRule' exists: replies from outside the organisation won't reach the agents."
    }

    Write-Host ""
    Write-Host "==> Transport rules for AI Agents:" -ForegroundColor Green
    Get-TransportRule | Where-Object { $_.Name -like "*AI Agents*" } |
        Format-List Name, State, Mode, Priority, FromMemberOf, SentToScope, ModerateMessageByUser
    if ($problems.Count) {
        $problems | ForEach-Object { Write-Warning $_ }
        Write-Host "==> Fix these with knowall-ai/sallie deploy/25-enable-email-moderation.ps1, not here." -ForegroundColor Red
        $script:failed = $true
    } else {
        Write-Host "==> OK: external mail from '$SecurityGroup' is held for approval by $($actual -join ', ')." -ForegroundColor Green
    }
} finally {
    # Disconnect
    Write-Host "==> Disconnecting from Exchange Online..."
    Disconnect-ExchangeOnline -Confirm:$false
}

Write-Host ""
Write-Host "==> Next: Run 09-restrict-teams.ps1 from this same machine."
if ($script:failed) { exit 1 }
