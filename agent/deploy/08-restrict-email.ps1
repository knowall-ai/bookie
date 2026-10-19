# =============================================================================
# Step 8: Check Email - Exchange Transport Rules (check only)
# Runs: Windows PowerShell (Exchange Online Management module)
# =============================================================================
# CHECK ONLY. Verifies the transport rules that hold AI agents' external email for approval and
# warns loudly if they are wrong; it never creates or changes anything:
#   "Moderate AI Agents External Outbound"  catch-all for the "AI Agents" group, owned by
#       knowall-ai/sallie deploy/25. It may skip (ExceptIfFrom) only agents with a rule of their own.
#   "Moderate External Outbound - Bookie"   Bookie's own rule and on/off switch, owned by step 14.
# EMAIL_MODERATORS lists who should be on both. Exits 1 if external email could go out unmoderated
# by mistake or the old block rule is back; Bookie's own rule switched off or missing only warns.
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
$AgentUPN        = Get-ConfigValue -Key "AGENT_UPN" -File $ConfigFile
$AgentName       = Get-ConfigValue -Key "AGENT_DISPLAY_NAME" -File $ConfigFile
if (-not $AgentName) { $AgentName = "Bookie" }
$Moderators      = @((Get-ConfigValue -Key "EMAIL_MODERATORS" -File $ConfigFile) -split '[\s,;]+' | Where-Object { $_ })
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
    # CHECK ONLY: this script never creates or changes a transport rule.
    #   "Moderate AI Agents External Outbound"  catch-all for the AI Agents group, owned by
    #       knowall-ai/sallie deploy/25; it skips (ExceptIfFrom) agents with a rule of their own.
    #   "Moderate External Outbound - Bookie"   Bookie's own rule, owned by step 14 here.
    # Re-creating the old block rules would stop every agent's external email.
    $outboundRule = "Block AI Agents External Outbound"
    $inboundRule  = "Block AI Agents External Inbound"
    $catchAllRule = "Moderate AI Agents External Outbound"
    $agentRule    = "Moderate External Outbound - $AgentName"
    $problems = @()

    # Rules store recipients as a name, alias or address: compare primary SMTP addresses.
    function Resolve-Smtp([string]$Identity) {
        $r = Get-Recipient -Identity $Identity -ErrorAction SilentlyContinue
        if ($r) { return "$($r.PrimarySmtpAddress)".ToLower() }
        return "$Identity (unresolved)".ToLower()
    }
    # Any value that is set counts, including a numeric 0 (e.g. ExceptIfSCLOver); a false switch or empty list doesn't.
    function Test-Set($Value) {
        return $null -ne $Value -and -not ($Value -is [string] -and $Value -eq '') -and
            -not ($Value -is [bool] -and -not $Value) -and
            -not ($Value -is [System.Collections.ICollection] -and $Value.Count -eq 0)
    }
    function Test-Moderators($Rule) {
        $actual = @($Rule.ModerateMessageByUser | ForEach-Object { Resolve-Smtp "$_" })
        if ($actual.Count -eq 0) { $script:problems += "'$($Rule.Name)' has no moderators." }
        foreach ($m in $Moderators) {
            if ($actual -notcontains (Resolve-Smtp $m)) {
                $script:problems += "Expected moderator $m is not on '$($Rule.Name)' (has: $($actual -join ', '))."
            }
        }
    }

    # 1. The catch-all must hold the group's external email
    $catchAll = Get-TransportRule -Identity $catchAllRule -ErrorAction SilentlyContinue
    if (-not $catchAll) {
        $problems += "'$catchAllRule' is missing: run knowall-ai/sallie deploy/25-enable-email-moderation.ps1."
    } else {
        if ($catchAll.State -ne 'Enabled') { $problems += "'$catchAllRule' is $($catchAll.State), not Enabled." }
        if ("$($catchAll.Mode)" -ne 'Enforce') { $problems += "'$catchAllRule' is in $($catchAll.Mode) mode, not Enforce." }
        if ("$($catchAll.SentToScope)" -ne 'NotInOrganization') { $problems += "'$catchAllRule' is not scoped to recipients outside the organisation." }
        # The group by identity, never display text: "AI Agents Test" must not pass for "AI Agents".
        $group = Get-Recipient -Identity $SecurityGroup -ErrorAction SilentlyContinue
        $ruleGroups = @($catchAll.FromMemberOf | ForEach-Object { Get-Recipient -Identity "$_" -ErrorAction SilentlyContinue })
        if (-not $group) {
            $problems += "Group '$SecurityGroup' was not found in Exchange."
        } elseif (-not ($ruleGroups | Where-Object { "$($_.Guid)" -eq "$($group.Guid)" })) {
            $problems += "'$catchAllRule' does not apply to '$SecurityGroup' (applies to: $($catchAll.FromMemberOf -join ', '))."
        }
        Test-Moderators $catchAll
        # Its only allowed exception is an agent with a rule of its own.
        foreach ($e in @($catchAll.PSObject.Properties | Where-Object { $_.Name -like 'ExceptIf*' -and $_.Name -ne 'ExceptIfFrom' -and (Test-Set $_.Value) })) {
            $problems += "'$catchAllRule' has an unexpected exception: $($e.Name)."
        }
        $agentRules = @(Get-TransportRule | Where-Object { $_.Name -like 'Moderate External Outbound - *' })
        $covered = @($agentRules | ForEach-Object { $_.From } | Where-Object { $_ } | ForEach-Object { Resolve-Smtp "$_" })
        foreach ($skipped in @($catchAll.ExceptIfFrom | Where-Object { $_ })) {
            $smtp = Resolve-Smtp "$skipped"
            if ($covered -notcontains $smtp) {
                $problems += "$smtp is skipped by '$catchAllRule' but has no 'Moderate External Outbound - <Agent>' rule: its external email goes out unmoderated."
            }
        }
    }

    # 2. Bookie's own rule: missing or switched off is reported, not a failure
    $own = Get-TransportRule -Identity $agentRule -ErrorAction SilentlyContinue
    if (-not $own) {
        Write-Warning "'$agentRule' is missing: $AgentName is held by the catch-all until step 14 creates it."
    } else {
        if ("$($own.Mode)" -ne 'Enforce') { $problems += "'$agentRule' is in $($own.Mode) mode, not Enforce." }
        if ("$($own.SentToScope)" -ne 'NotInOrganization') { $problems += "'$agentRule' is not scoped to recipients outside the organisation." }
        if (@($own.From | ForEach-Object { Resolve-Smtp "$_" }) -notcontains (Resolve-Smtp $AgentUPN)) {
            $problems += "'$agentRule' does not match $AgentUPN (From: $($own.From -join ', '))."
        }
        Test-Moderators $own
        if ($own.State -ne 'Enabled') {
            Write-Warning "Moderation is switched OFF for ${AgentName}: his external email is delivered without approval (step 14 -Moderation On)."
        }
    }

    # 3. The old blocks must stay gone
    if (Get-TransportRule -Identity $outboundRule -ErrorAction SilentlyContinue) {
        $problems += "'$outboundRule' is back: every agent's external email is rejected."
    }
    if (Get-TransportRule -Identity $inboundRule -ErrorAction SilentlyContinue) {
        Write-Warning "'$inboundRule' exists: replies from outside the organisation won't reach the agents."
    }

    Write-Host ""
    Write-Host "==> Moderation rules:" -ForegroundColor Green
    Get-TransportRule | Where-Object { $_.Name -like "Moderate*External Outbound*" -or $_.Name -like "*AI Agents*" } |
        Format-List Name, State, Mode, Priority, From, FromMemberOf, ExceptIfFrom, SentToScope, ModerateMessageByUser
    if ($problems.Count) {
        $problems | ForEach-Object { Write-Host "    FAIL: $_" -ForegroundColor Red }
        $script:failed = $true
    } else {
        Write-Host "==> Email moderation OK" -ForegroundColor Green
    }
} finally {
    # Disconnect
    Write-Host "==> Disconnecting from Exchange Online..."
    Disconnect-ExchangeOnline -Confirm:$false
}

Write-Host ""
Write-Host "==> Next: Run 09-restrict-teams.ps1 from this same machine."
if ($script:failed) { exit 1 }
