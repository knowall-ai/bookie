# =============================================================================
# Step 9: Restrict Teams - Information Barrier Policies
# Runs: Windows PowerShell (Security & Compliance module)
# =============================================================================
# Information Barriers prevent AI agents from communicating with external users
# in Teams. Requires M365 E5, E5 Compliance, or Information Barriers add-on.
#
# If Information Barriers are not available, fall back to Teams messaging policy
# that restricts external access for the AI Agents group.
# 
# Adapted for Bookie from knowall-ai/poppie-hermes. Idempotent (existing rules/policies are kept).
# =============================================================================

param(
    [string]$ConfigFile = "$PSScriptRoot/config.env",
    [switch]$FallbackMessagingPolicy
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

$SecurityGroup = Get-ConfigValue -Key "SECURITY_GROUP" -File $ConfigFile
$AdminUPN      = $env:M365_ADMIN_UPN
if (-not $AdminUPN) { $AdminUPN = Read-Host "Compliance admin UPN" }

Write-Host "==> Step 9: Restricting Teams communications for '$SecurityGroup'" -ForegroundColor Cyan

if ($FallbackMessagingPolicy) {
    # -------------------------------------------------------------------------
    # Fallback: Teams messaging policy (when Information Barriers not available)
    # -------------------------------------------------------------------------
    Write-Host "==> Using fallback: Teams messaging policy (no Information Barriers license)"

    if (-not (Get-Module -ListAvailable -Name MicrosoftTeams)) {
        Write-Host "==> Installing MicrosoftTeams module..."
        Install-Module MicrosoftTeams -Force -Scope CurrentUser
    }

    Connect-MicrosoftTeams

    try {
        # Create a messaging policy that blocks external communication
        $policyName = "AI Agents - Internal Only"
        $existing = Get-CsTeamsMessagingPolicy -Identity $policyName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "    Policy '$policyName' already exists. Skipping."
        } else {
            Write-Host "==> Creating Teams messaging policy: $policyName"
            New-CsTeamsMessagingPolicy -Identity $policyName `
                -AllowUserChat $true `
                -AllowUserDeleteMessage $false `
                -AllowUrlPreviews $true
        }

        Write-Host "==> NOTE: Assign this policy to AI agent users in the Teams Admin Center."
        Write-Host "    Teams Admin Center > Users > Select user > Policies > Messaging policy"

    } finally {
        Disconnect-MicrosoftTeams
    }

} else {
    # -------------------------------------------------------------------------
    # Primary: Information Barrier Policies
    # -------------------------------------------------------------------------
    Write-Host "==> Using Information Barrier Policies"
    Write-Host "==> Connecting to Security & Compliance..."
    Connect-IPPSSession -UserPrincipalName $AdminUPN

    try {
        # Create organization segment for AI Agents
        $aiSegment = Get-OrganizationSegment -Identity "AI Agents" -ErrorAction SilentlyContinue
        if ($aiSegment) {
            Write-Host "    Segment 'AI Agents' already exists. Skipping."
        } else {
            Write-Host "==> Creating organization segment: AI Agents"
            New-OrganizationSegment -Name "AI Agents" `
                -UserGroupFilter "MemberOf -eq '$SecurityGroup'"
        }

        # Create segment for internal staff
        $staffSegment = Get-OrganizationSegment -Identity "Internal Staff" -ErrorAction SilentlyContinue
        if ($staffSegment) {
            Write-Host "    Segment 'Internal Staff' already exists. Skipping."
        } else {
            Write-Host "==> Creating organization segment: Internal Staff"
            New-OrganizationSegment -Name "Internal Staff" `
                -UserGroupFilter "MemberOf -ne '$SecurityGroup'"
        }

        # Create IB policy: AI Agents can ONLY communicate with Internal Staff and other AI Agents
        $policy = Get-InformationBarrierPolicy -Identity "AI Agents Internal Only" -ErrorAction SilentlyContinue
        if ($policy) {
            Write-Host "    Policy 'AI Agents Internal Only' already exists. Skipping."
        } else {
            Write-Host "==> Creating Information Barrier policy: AI Agents Internal Only"
            New-InformationBarrierPolicy -Name "AI Agents Internal Only" `
                -AssignedSegment "AI Agents" `
                -SegmentsAllowed "Internal Staff","AI Agents" `
                -State Active
        }

        # Apply policies
        Write-Host "==> Applying Information Barrier policies..."
        Start-InformationBarrierPoliciesApplication

        Write-Host ""
        Write-Host "==> Information Barrier policies applied." -ForegroundColor Green

    } finally {
        Disconnect-IPPSSession
    }
}

Write-Host ""
Write-Host "==> Next: 10-grant-accounts-mailbox.ps1 (if Bookie captures bills), then 11-setup-ssl-proxy.sh on the VM."
