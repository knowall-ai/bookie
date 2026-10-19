# =============================================================================
# Step 14: Email Moderation for Bookie (his own rule, with an on/off switch)
# Runs: PowerShell (Exchange Online Management module)
# =============================================================================
# External email FROM Bookie is held until a moderator approves it (Outlook, or
# the Agents Portal's Approvals tab). Two kinds of transport rule do this:
#
#   "Moderate External Outbound - Bookie"   Bookie's own rule, owned by THIS
#       script. Disable it to let Bookie send external email without approval;
#       enable it to hold his email again.
#
#   "Moderate AI Agents External Outbound"  the catch-all for the AI Agents
#       group, owned by knowall-ai/sallie deploy/25. It skips agents that have a
#       rule of their own (ExceptIfFrom). This script only adds Bookie to that
#       list, after his own rule is in force, so his email is never unmoderated
#       by accident. It never changes anything else on the catch-all, and keeps
#       every other agent's entry.
#
# Usage:
#   pwsh ./14-email-moderation.ps1                  # create/update Bookie's rule
#   pwsh ./14-email-moderation.ps1 -Moderation Off  # Bookie sends external email unapproved
#   pwsh ./14-email-moderation.ps1 -Moderation On   # hold Bookie's external email again
#
# Re-running without -Moderation keeps whatever on/off state his rule is in.
# Moderators come from EMAIL_MODERATORS (space or comma separated); any one of
# them can approve or reject. Step 08 checks the result.
# =============================================================================

param(
    [string]$ConfigFile = "$PSScriptRoot/config.env",
    [ValidateSet("On", "Off")]
    [string]$Moderation
)

function Get-ConfigValue {
    param([string]$Key, [string]$File)
    $line = Get-Content $File | Where-Object { $_ -match "^${Key}=" } | Select-Object -First 1
    if ($line) {
        return (($line -split '=', 2)[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'")
    }
    return $null
}

# Rules store recipients in whatever form Exchange chose (name, alias or address),
# so compare primary SMTP addresses.
function Resolve-Smtp {
    param([string]$Identity)
    $recipient = Get-Recipient -Identity $Identity -ErrorAction SilentlyContinue
    if ($recipient) { return $recipient.PrimarySmtpAddress.ToString().ToLower() }
    return $Identity.ToLower()
}

$AgentUPN   = Get-ConfigValue -Key "AGENT_UPN" -File $ConfigFile
$AgentName  = Get-ConfigValue -Key "AGENT_DISPLAY_NAME" -File $ConfigFile
$Moderators = @((Get-ConfigValue -Key "EMAIL_MODERATORS" -File $ConfigFile) -split '[\s,;]+' | Where-Object { $_ })
$AdminUPN   = $env:M365_ADMIN_UPN
if (-not $AdminUPN) { $AdminUPN = Read-Host "Exchange admin UPN" }

if (-not $AgentUPN -or -not $AgentName) {
    Write-Error "AGENT_UPN and AGENT_DISPLAY_NAME must be set in $ConfigFile"
    exit 1
}
if (-not $Moderation -and $Moderators.Count -eq 0) {
    Write-Error "EMAIL_MODERATORS must be set in $ConfigFile"
    exit 1
}

$CatchAllRule = "Moderate AI Agents External Outbound"
$AgentRule    = "Moderate External Outbound - $AgentName"

Write-Host "==> Step 14: Email moderation for $AgentName ($AgentUPN)" -ForegroundColor Cyan

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Write-Host "==> Installing ExchangeOnlineManagement module..."
    Install-Module ExchangeOnlineManagement -Force -Scope CurrentUser
}

Write-Host "==> Connecting to Exchange Online as $AdminUPN..."
# Linux and macOS have no embedded browser for the sign-in: use a device code there.
if ($IsWindows -or $PSVersionTable.PSEdition -eq 'Desktop') {
    Connect-ExchangeOnline -UserPrincipalName $AdminUPN
} else {
    Connect-ExchangeOnline -UserPrincipalName $AdminUPN -Device
}

$failed = $false
try {
    # =========================================================================
    # Switch only: turn Bookie's own rule off or on, nothing else
    # =========================================================================
    if ($Moderation) {
        $rule = Get-TransportRule -Identity $AgentRule -ErrorAction SilentlyContinue
        if (-not $rule) {
            Write-Warning "Rule '$AgentRule' does not exist yet. Run this script without -Moderation first."
            $failed = $true
        } else {
            if ($Moderation -eq "Off") {
                Write-Warning "$AgentName's external email will be DELIVERED WITHOUT APPROVAL until moderation is switched back on."
                Disable-TransportRule -Identity $AgentRule -Confirm:$false -ErrorAction Stop
            } else {
                Enable-TransportRule -Identity $AgentRule -ErrorAction Stop
            }
            Get-TransportRule -Identity $AgentRule | Format-List Name, State, Mode, From, ModerateMessageByUser
        }
    } else {

        # =========================================================================
        # 1. Bookie's own rule: created enabled; an existing rule keeps its on/off
        #    state, so re-running never undoes a switch
        # =========================================================================
        $existing = Get-TransportRule -Identity $AgentRule -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "==> Updating rule: $AgentRule (currently $($existing.State))"
            Set-TransportRule -Identity $AgentRule `
                -From $AgentUPN `
                -SentToScope NotInOrganization `
                -ModerateMessageByUser $Moderators `
                -Mode Enforce -ErrorAction Stop
        } else {
            Write-Host "==> Creating rule: $AgentRule"
            New-TransportRule -Name $AgentRule `
                -From $AgentUPN `
                -SentToScope NotInOrganization `
                -ModerateMessageByUser $Moderators `
                -Mode Enforce `
                -Enabled $true -ErrorAction Stop | Out-Null
        }

        # =========================================================================
        # 2. Skip Bookie in the catch-all, only once his own rule is enforcing.
        #    Read the list, resolve each entry, append Bookie, set it back: other
        #    agents' entries must survive. Nothing else on the catch-all changes.
        # =========================================================================
        $own = Get-TransportRule -Identity $AgentRule -ErrorAction Stop
        $catchAll = Get-TransportRule -Identity $CatchAllRule -ErrorAction SilentlyContinue
        $agentSmtp = Resolve-Smtp $AgentUPN
        if (-not $catchAll) {
            Write-Warning "'$CatchAllRule' doesn't exist yet (knowall-ai/sallie deploy/25 creates it). $AgentName's own rule covers him."
        } elseif ("$($own.Mode)" -ne 'Enforce' -or ($own.State -ne 'Enabled' -and -not $existing)) {
            Write-Warning "'$AgentRule' is not enforcing, so $AgentName stays under '$CatchAllRule'."
            $failed = $true
        } else {
            $skipped = @($catchAll.ExceptIfFrom | Where-Object { $_ } | ForEach-Object { Resolve-Smtp "$_" })
            if ($skipped -contains $agentSmtp) {
                Write-Host "    '$CatchAllRule' already skips $agentSmtp."
            } else {
                Write-Host "==> Adding $agentSmtp to the agents '$CatchAllRule' skips (keeping: $($skipped -join ', '))"
                Set-TransportRule -Identity $CatchAllRule -ExceptIfFrom (@($skipped) + $agentSmtp) -ErrorAction Stop
                $after = @((Get-TransportRule -Identity $CatchAllRule).ExceptIfFrom | ForEach-Object { Resolve-Smtp "$_" })
                $lost = @($skipped | Where-Object { $after -notcontains $_ })
                if ($lost.Count -or $after -notcontains $agentSmtp) {
                    Write-Warning "'$CatchAllRule' skip list is not what was set (lost: $($lost -join ', ')). Check it now."
                    $failed = $true
                }
            }
        }

        Write-Host ""
        Write-Host "==> Moderation rules:" -ForegroundColor Green
        Get-TransportRule | Where-Object { $_.Name -like "Moderate*External Outbound*" } |
            Format-List Name, State, Mode, Priority, From, FromMemberOf, ExceptIfFrom, ModerateMessageByUser
        Write-Host "    Switch $AgentName on/off with: pwsh ./14-email-moderation.ps1 -Moderation Off|On"
    }
} finally {
    Write-Host "==> Disconnecting from Exchange Online..."
    Disconnect-ExchangeOnline -Confirm:$false
}
if ($failed) { exit 1 }
