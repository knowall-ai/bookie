# =============================================================================
# Step 8: Restrict Email - Exchange Transport Rules
# Runs: Windows PowerShell (Exchange Online Management module)
# =============================================================================
# This script sets the transport rules for AI agents' external email. The rules apply to all members of the "AI Agents"
# security group.
#
# With EMAIL_MODERATORS set, the group's external mail is moderated instead of blocked: the
# shared rule "Moderate AI Agents External Outbound" holds each message and sends the
# moderators an "Approval requested" message, which they approve or reject in Outlook or the
# Agents Portal's Approvals tab. knowall-ai/sallie (deploy/25) manages the same rule; keep the
# moderators the same in both. With no moderation rule and EMAIL_MODERATORS empty, the agents
# stay internal-only.
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

Write-Host "==> Step 8: Restricting email for '$SecurityGroup' group members" -ForegroundColor Cyan

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
    # The AI Agents group shares these rules with every KnowAll agent (Sallie, Poppie...).
    # knowall-ai/sallie deploy/25-enable-email-moderation.ps1 manages the same moderation rule:
    # keep EMAIL_MODERATORS the same in both, and never re-create a block rule once
    # moderation is in force, or every agent's external email is blocked again.
    $outboundRule  = "Block AI Agents External Outbound"
    $inboundRule   = "Block AI Agents External Inbound"
    $moderatedRule = "Moderate AI Agents External Outbound"

    $moderated = Get-TransportRule -Identity $moderatedRule -ErrorAction SilentlyContinue
    if ($Moderators.Count -gt 0) {
        Write-Host "==> External mail from '$SecurityGroup' is held for approval by: $($Moderators -join ', ')"
        if ($moderated) {
            Set-TransportRule -Identity $moderatedRule `
                -FromMemberOf $SecurityGroup `
                -SentToScope NotInOrganization `
                -ModerateMessageByUser $Moderators `
                -Mode Enforce `
                -Priority 0 -ErrorAction Stop
            Enable-TransportRule -Identity $moderatedRule -ErrorAction Stop
        } else {
            New-TransportRule -Name $moderatedRule `
                -FromMemberOf $SecurityGroup `
                -SentToScope NotInOrganization `
                -ModerateMessageByUser $Moderators `
                -Mode Enforce `
                -Enabled $true `
                -Priority 0 -ErrorAction Stop | Out-Null
        }
    } elseif ($moderated) {
        Write-Host "    EMAIL_MODERATORS is empty: leaving '$moderatedRule' as it is (moderators: $($moderated.ModerateMessageByUser -join ', '))."
    }

    $moderated = Get-TransportRule -Identity $moderatedRule -ErrorAction SilentlyContinue
    $enforced = $moderated -and $moderated.State -eq 'Enabled' -and "$($moderated.Mode)" -eq 'Enforce' -and
        $moderated.ModerateMessageByUser -and "$($moderated.SentToScope)" -eq 'NotInOrganization'
    if ($moderated -and -not $enforced) {
        Write-Warning "'$moderatedRule' exists but is not enabled and enforcing with moderators."
    }
    if ($moderated -and @($moderated.PSObject.Properties | Where-Object { $_.Name -like 'ExceptIf*' -and $_.Value }).Count) {
        Write-Warning "'$moderatedRule' has exceptions: some agents' external mail may skip approval."
    }

    if ($enforced) {
        # Moderation covers outbound mail, so the old block would only reject what should be held.
        if (Get-TransportRule -Identity $outboundRule -ErrorAction SilentlyContinue) {
            Write-Host "==> Removing '$outboundRule' (moderation is in force)"
            Remove-TransportRule -Identity $outboundRule -Confirm:$false -ErrorAction Stop
        }
        # Inbound is left as it is: with moderation the agents may need replies from outside.
    } else {
        # No working moderation: agents stay internal-only.
        if (Get-TransportRule -Identity $outboundRule -ErrorAction SilentlyContinue) {
            Write-Host "    Rule '$outboundRule' already exists. Skipping."
        } else {
            Write-Host "==> Creating transport rule: $outboundRule"
            New-TransportRule -Name $outboundRule `
                -FromMemberOf $SecurityGroup `
                -SentToScope NotInOrganization `
                -RejectMessageReasonText "AI agents are not permitted to send external email." `
                -Priority 0 -ErrorAction Stop
        }
        # Block INBOUND external email TO AI Agents
        # Exception: allow internal users to forward external emails to AI agents
        # (when a colleague forwards an external email, the original external sender triggers the rule,
        # but the -ExceptIfSenderDomainIs exception allows it because the forwarder is internal)
        if (Get-TransportRule -Identity $inboundRule -ErrorAction SilentlyContinue) {
            Write-Host "    Rule '$inboundRule' already exists. Updating exception for internal forwarding..."
            Set-TransportRule -Identity $inboundRule -ExceptIfSenderDomainIs $InternalDomain
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
    }

    # Verify rules
    Write-Host ""
    Write-Host "==> Transport rules for AI Agents:" -ForegroundColor Green
    Get-TransportRule | Where-Object { $_.Name -like "*AI Agents*" } |
        Format-List Name, State, Mode, Priority, FromMemberOf, SentToScope, ModerateMessageByUser
} finally {
    # Disconnect
    Write-Host "==> Disconnecting from Exchange Online..."
    Disconnect-ExchangeOnline -Confirm:$false
}

Write-Host ""
Write-Host "==> Next: Run 09-restrict-teams.ps1 from this same machine."
