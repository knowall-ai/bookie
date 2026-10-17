# =============================================================================
# Step 10: give Bookie access to the shared accounts mailbox (bill capture)
# Runs: PowerShell 7 with ExchangeOnlineManagement; interactive Exchange admin sign-in. Idempotent.
#   pwsh ./10-grant-accounts-mailbox.ps1                       # RECOMMENDED: FullAccess for bookie@
#   pwsh ./10-grant-accounts-mailbox.ps1 -AppId <client id>    # ALTERNATIVE: app-only, scoped by policy
# =============================================================================
# Two ways to let Bookie read and file the mail at accounts@ (ACCOUNTS_MAILBOX in config.env):
#
# A. FullAccess for bookie@ (default, recommended). Add-MailboxPermission with AutoMapping off, so
#    the mailbox does not appear in anyone's Outlook. Bookie reaches it through his own DELEGATED
#    Graph sign-in (graph.mjs with MS365_USER_ID=accounts@...; Bookie's Graph app needs the delegated
#    Mail.ReadWrite.Shared scope, step 21). Why this is the least privilege:
#      - one mailbox, by construction: there is no tenant-wide permission anywhere, so no policy
#        mistake can widen it to every mailbox;
#      - no new credential: no client secret on the VM for mail, nothing extra to rotate or leak;
#      - every action is audited as bookie@ in the mailbox audit log;
#      - FullAccess does not include Send As or Send on Behalf, so Bookie still cannot send as accounts@.
#    Cost: it rides on Bookie's interactive account (protect it with MFA, Conditional Access).
#
# B. App-only Graph (alternative). A dedicated app registration with the APPLICATION permission
#    Mail.ReadWrite, which by itself covers EVERY mailbox in the tenant, restricted to accounts@ only.
#    Use it if delegated access to a shared mailbox is not enough (e.g. Graph refuses a delegated
#    change-notification subscription on it). Restrict it with either:
#      - Exchange RBAC for Applications (current Microsoft guidance): a management scope matching only
#        accounts@ and a role assignment "Application Mail.ReadWrite" for the app's service principal; or
#      - the older ApplicationAccessPolicy (RestrictAccess to a mail-enabled security group that holds
#        only accounts@), which this script creates with -AppId. Microsoft is replacing it with RBAC
#        for Applications; do not use both for the same app.
#    Verify with Test-ApplicationAccessPolicy (below): accounts@ = Granted, any other mailbox = Denied.
#    Then a client secret or certificate lives on the VM; prefer a certificate.
# =============================================================================
param(
    [string]$ConfigFile = "$PSScriptRoot/config.env",
    [string]$AppId = "",                  # set only for option B
    [string]$ScopeGroup = "Bookie Accounts Mailbox Scope"
)
$ErrorActionPreference = 'Stop'

function Get-ConfigValue {
    param([string]$Key, [string]$File)
    $line = Get-Content $File | Where-Object { $_ -match "^${Key}=" } | Select-Object -First 1
    if ($line) { return (($line -split '=', 2)[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'") }
    return $null
}

$AgentUpn = Get-ConfigValue -Key 'AGENT_UPN' -File $ConfigFile
$Mailbox  = Get-ConfigValue -Key 'ACCOUNTS_MAILBOX' -File $ConfigFile
if (-not $Mailbox) { throw 'ACCOUNTS_MAILBOX is empty in config.env: nothing to grant.' }
$AdminUpn = $env:M365_ADMIN_UPN
if (-not $AdminUpn) { $AdminUpn = Read-Host 'Exchange admin UPN' }

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Install-Module ExchangeOnlineManagement -Force -Scope CurrentUser
}
Connect-ExchangeOnline -UserPrincipalName $AdminUpn -ShowBanner:$false
try {
    $mbx = Get-Mailbox -Identity $Mailbox -ErrorAction SilentlyContinue
    if (-not $mbx) { throw "$Mailbox is not a mailbox in this tenant." }
    Write-Host "==> $Mailbox is a $($mbx.RecipientTypeDetails)"

    if (-not $AppId) {
        # ---- Option A: FullAccess for bookie@, AutoMapping off -------------------------------
        Write-Host "==> Step 10 (A): FullAccess on $Mailbox for $AgentUpn (AutoMapping disabled)"
        $existing = Get-MailboxPermission -Identity $Mailbox -User $AgentUpn -ErrorAction SilentlyContinue |
            Where-Object { $_.AccessRights -contains 'FullAccess' -and -not $_.Deny }
        if ($existing) {
            Write-Host '    already granted'
        } else {
            Add-MailboxPermission -Identity $Mailbox -User $AgentUpn -AccessRights FullAccess `
                -InheritanceType All -AutoMapping $false | Out-Null
            Write-Host '    granted'
        }
        # Make sure nothing grants send rights by accident.
        $sendAs = Get-RecipientPermission -Identity $Mailbox -Trustee $AgentUpn -ErrorAction SilentlyContinue
        if ($sendAs) { Write-Warning "$AgentUpn has Send As on $Mailbox. Bookie never sends; remove it: Remove-RecipientPermission -Identity $Mailbox -Trustee $AgentUpn -AccessRights SendAs" }
        # Mailbox auditing records what Bookie does there.
        Set-Mailbox -Identity $Mailbox -AuditEnabled $true
        Get-MailboxPermission -Identity $Mailbox -User $AgentUpn | Format-Table User, AccessRights, IsInherited
        Write-Host ''
        Write-Host 'HUMAN STEP: create the folders "Bookie/Processed" and "Bookie/Needs review" under the Inbox of'
        Write-Host "            $Mailbox (Outlook on the web, as someone with access). bill-capture files mail there."
    } else {
        # ---- Option B: app-only Mail.ReadWrite restricted to accounts@ ---------------------------
        Write-Host "==> Step 10 (B): ApplicationAccessPolicy for app $AppId, restricted to $Mailbox"
        $group = Get-DistributionGroup -Identity $ScopeGroup -ErrorAction SilentlyContinue
        if (-not $group) {
            New-DistributionGroup -Name $ScopeGroup -Type Security -MemberDepartRestriction Closed `
                -MemberJoinRestriction Closed | Out-Null
            Set-DistributionGroup -Identity $ScopeGroup -HiddenFromAddressListsEnabled $true
        }
        $members = Get-DistributionGroupMember -Identity $ScopeGroup -ResultSize Unlimited
        if (-not ($members | Where-Object { $_.PrimarySmtpAddress -eq $Mailbox })) {
            Add-DistributionGroupMember -Identity $ScopeGroup -Member $Mailbox
        }
        $extra = $members | Where-Object { $_.PrimarySmtpAddress -ne $Mailbox }
        if ($extra) { Write-Warning "$ScopeGroup has other members ($($extra.PrimarySmtpAddress -join ', ')): the app can reach them too." }
        $policy = Get-ApplicationAccessPolicy | Where-Object { $_.AppId -eq $AppId }
        if ($policy) {
            Write-Host '    policy exists'
        } else {
            $groupSmtp = (Get-DistributionGroup -Identity $ScopeGroup).PrimarySmtpAddress
            New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $groupSmtp -AccessRight RestrictAccess `
                -Description "Bookie bill capture: $Mailbox only" | Out-Null
            Write-Host '    policy created (takes up to an hour to apply)'
        }
        Write-Host '==> Test (expect Granted, then Denied):'
        Test-ApplicationAccessPolicy -Identity $Mailbox -AppId $AppId | Format-Table AppId, Mailbox, AccessCheckResult
        Test-ApplicationAccessPolicy -Identity $AdminUpn -AppId $AppId | Format-Table AppId, Mailbox, AccessCheckResult
        Write-Host 'Then grant the app the Microsoft Graph APPLICATION permission Mail.ReadWrite with admin consent.'
    }
} finally {
    Disconnect-ExchangeOnline -Confirm:$false
}
Write-Host '==> Next: 11-setup-ssl-proxy.sh on the VM; 21-setup-graph-webhooks.sh wires up the accounts@ wake.'
