param(
    [Parameter(Mandatory = $true)][string]$Submission,
    [string[]]$Binding = @()
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$guide = 'https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/#prerequisites'

function Stop-Setup([string]$Message) {
    Write-Host "$Message`nPrerequisites: $guide" -ForegroundColor Red
    exit 1
}
function Confirm-Setup([string]$Message) {
    if ((Read-Host "$Message [y/N]") -notmatch '^(y|yes)$') { Stop-Setup 'Cancelled.' }
}
function Invoke-Native([string]$File, [string[]]$Arguments, [int[]]$Allowed = @(0)) {
    Write-Host "`n> $File $($Arguments -join ' ')"
    & $File @Arguments
    $script:NativeExitCode = $LASTEXITCODE
    if ($Allowed -notcontains $script:NativeExitCode) {
        Write-Host 'Setup stopped. Any created app folder is preserved. Resolve the native error before resuming.' -ForegroundColor Red
        exit $script:NativeExitCode
    }
}
function Invoke-Ms {
    Invoke-Native 'npx.cmd' (@('--yes', '--package=@microsoft/managed-apps-cli', '--', 'ms') + $args)
}
function Test-Node {
    foreach ($tool in @('node', 'npm.cmd', 'npx.cmd')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { return $false }
    }
    $version = & node --version
    return $LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.(\d+)\.' -and
        ([int]$Matches[1] -gt 24 -or ([int]$Matches[1] -eq 24 -and [int]$Matches[2] -ge 11))
}
function Test-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $false }
    $version = & git --version
    return $LASTEXITCODE -eq 0 -and $version -match '(\d+)\.(\d+)\.' -and
        ([int]$Matches[1] -gt 2 -or ([int]$Matches[1] -eq 2 -and [int]$Matches[2] -ge 27))
}
function Test-Gcm {
    $ErrorActionPreference = 'Continue'
    foreach ($name in @('credential-manager', 'credential-manager-core')) {
        & git $name --version *> $null
        if ($LASTEXITCODE -eq 0) { $script:GcmCommand = $name; return $true }
    }
    return $false
}
function Install-Prerequisite([string]$Id, [string]$Name) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Stop-Setup "WinGet is unavailable. Install $Name using Microsoft's prerequisite instructions, then retry."
    }
    Confirm-Setup "Install $Name using WinGet? The official installer may request administrator approval or display terms."
    Invoke-Native 'winget' @('install', '--id', $Id, '--exact', '--interactive')
    $paths = @(
        [Environment]::GetEnvironmentVariable('Path', 'Machine'),
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        $env:Path
    ) | Where-Object { $_ }
    $env:Path = $paths -join ';'
}

if ($env:OS -ne 'Windows_NT') { Stop-Setup 'This PowerShell installer supports Windows only.' }
if ($Submission -cnotmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') { Stop-Setup 'Invalid submission name.' }
if ($Binding.Count -gt 12) { Stop-Setup 'Too many connector bindings.' }
foreach ($value in $Binding) {
    if ($value -cnotmatch '^((?:shared_)?[a-z0-9_]{1,100}):(table|action)(?::([A-Za-z][A-Za-z0-9_]{0,99}))?$') {
        Stop-Setup 'Invalid connector binding.'
    }
    if ($Matches[1] -eq 'shared_commondataserviceforapps' -and $Matches[2] -eq 'table') {
        if (-not $Matches[3]) { Stop-Setup 'Dataverse requires a logical table name.' }
    } elseif ($Matches[3]) { Stop-Setup 'Only Dataverse table bindings accept a fixed table.' }
}
if (Test-Path -LiteralPath "./$Submission") {
    Stop-Setup 'The destination already exists. Choose an empty parent folder; existing work will not be overwritten.'
}
if (-not (Test-Node)) {
    Install-Prerequisite 'OpenJS.NodeJS.LTS' 'Node.js LTS and npm'
    if (-not (Test-Node)) { Stop-Setup 'Node.js >=24.11, npm, and npx are still unavailable. Open a new terminal and retry.' }
}
if (-not (Test-Git)) {
    Install-Prerequisite 'Git.Git' 'Git for Windows (including Git Credential Manager)'
    if (-not (Test-Git)) { Stop-Setup 'Git >=2.27 is still unavailable. Open a new terminal and retry.' }
}
if (-not (Test-Gcm)) {
    Install-Prerequisite 'Git.GCM' 'Git Credential Manager'
    if (-not (Test-Gcm)) { Stop-Setup 'Git Credential Manager is still unavailable. Open a new terminal and retry.' }
}
$helpers = & git config --get-all credential.helper
if ($LASTEXITCODE -notin @(0, 1)) { exit $LASTEXITCODE }
if (-not ($helpers | Where-Object { $_ -match '^(manager|manager-core)$|[\\/]git-credential-manager(?:-core)?(?:\.exe)?["]?$' })) {
    Confirm-Setup 'Configure Git Credential Manager for your account? Its configure command updates your Git credential-helper settings.'
    Invoke-Native 'git' @($script:GcmCommand, 'configure')
}

Invoke-Ms auth login
Invoke-Ms auth status
Invoke-Ms app create "./$Submission" --repo native --template "github:microsoft/copilot-studio-gallery/submissions/$Submission/app#main"
Set-Location -LiteralPath "./$Submission"
foreach ($value in $Binding) {
    $parts = $value.Split(':')
    $arguments = @('app', 'add', 'data-source', '--connector', $parts[0], '--as', $parts[1])
    if ($parts.Length -eq 3) { $arguments += @('--table', $parts[2]) }
    Invoke-Ms @arguments
}
Invoke-Native 'npm.cmd' @('install')
Invoke-Ms app pack
Invoke-Native 'git' @('add', '--all')
Invoke-Native 'git' @('diff', '--cached', '--quiet') @(0, 1)
if ($script:NativeExitCode -eq 1) {
    Invoke-Native 'git' @('commit', '-m', 'Configure gallery app', '-m', 'Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>')
}
Invoke-Native 'git' @('push', '--set-upstream', 'origin', 'HEAD')
Invoke-Ms app build
Write-Host "`nOpen preview with the same account and tenant shown by ms auth status. Use the printed URL in the matching browser profile."
Invoke-Ms app play --mode preview
