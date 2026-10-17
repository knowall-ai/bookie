# =============================================================================
# Step 06 part 2: Exchange mail-enabled security group "AI Agents" + Bookie as a member
# Runs: PowerShell 7 with ExchangeOnlineManagement; interactive admin sign-in. Idempotent.
# Called by 06-add-to-ai-agents-group.sh, or run directly: pwsh ./06-add-to-ai-agents-group.ps1
# Adapted from knowall-ai/poppie-hermes deploy/06-create-security-group.ps1.
# =============================================================================
param(
    [string]$ConfigFile = "$PSScriptRoot/config.env"
)
$ErrorActionPreference = 'Stop'

function Get-ConfigValue {
    param([string]$Key, [string]$File)
    $line = Get-Content $File | Where-Object { $_ -match "^${Key}=" } | Select-Object -First 1
    if ($line) { return (($line -split '=', 2)[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'") }
    return $null
}

$SecurityGroup = Get-ConfigValue -Key 'SECURITY_GROUP' -File $ConfigFile
$AgentUpn      = Get-ConfigValue -Key 'AGENT_UPN' -File $ConfigFile
$AdminUpn      = $env:M365_ADMIN_UPN
if (-not $AdminUpn) { $AdminUpn = Read-Host 'Exchange admin UPN' }

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Write-Host '==> Installing ExchangeOnlineManagement module...'
    Install-Module ExchangeOnlineManagement -Force -Scope CurrentUser
}

Write-Host "==> Connecting to Exchange Online as $AdminUpn"
Connect-ExchangeOnline -UserPrincipalName $AdminUpn -ShowBanner:$false
try {
    $group = Get-DistributionGroup -Identity $SecurityGroup -ErrorAction SilentlyContinue
    if ($group -and $group.RecipientTypeDetails -ne 'MailUniversalSecurityGroup') {
        throw "'$SecurityGroup' exists in Exchange but is not a mail-enabled security group ($($group.RecipientTypeDetails))."
    }
    if (-not $group) {
        Write-Host "==> Creating mail-enabled security group '$SecurityGroup'"
        New-DistributionGroup -Name $SecurityGroup -Type Security -MemberDepartRestriction Closed -MemberJoinRestriction Closed | Out-Null
    } else {
        Write-Host "    '$SecurityGroup' exists ($($group.PrimarySmtpAddress))"
    }

    $member = Get-DistributionGroupMember -Identity $SecurityGroup -ResultSize Unlimited |
        Where-Object { $_.PrimarySmtpAddress -eq $AgentUpn }
    if ($member) {
        Write-Host "    $AgentUpn already a member"
    } else {
        Add-DistributionGroupMember -Identity $SecurityGroup -Member $AgentUpn
        Write-Host "    added $AgentUpn"
    }
} finally {
    Disconnect-ExchangeOnline -Confirm:$false
}
Write-Host '==> Next: 07-assign-license.sh'
