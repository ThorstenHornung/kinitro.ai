<#
.SYNOPSIS
  Brings every Claude Code configuration directory on this machine to kinitro 0.26.1
  and removes the deprecated kinitro pieces.

.DESCRIPTION
  A person who uses several Claude subscriptions has one config directory (CLAUDE_CONFIG_DIR)
  per subscription. This script finds them, and in each one:
    1. reads `claude --version`;
    2. lists marketplaces and plugins;
    3. makes sure the marketplace `kinitro-ai` (GitHub ThorstenHornung/kinitro.ai) exists and updates it;
    4. uninstalls deprecated plugins: kinitro-ai-em (any marketplace), kinitro-ai-test (any marketplace),
       kinitro-ai (any marketplace; the plugin was renamed to kinitro in 0.26.1),
       and kinitro from any marketplace other than `kinitro-ai`;
    5. installs or updates kinitro@kinitro-ai;
    6. lists deprecated user-scope MCP servers (kinitro_ai, kinitro-ai, kinitro_ai_test, kinitro_ai_device, kinitro_ai_device_test) and removes them only
       with -RemoveMcp (a running Architect or seat session may still rely on one);
    7. verifies the result (plugin version equals the marketplace version, nothing deprecated left).
  It also REPORTS (never changes) project-level .mcp.json files that name a kinitro server, in
  C:\Develop\Projects\* (one level deep).

  Default is a dry run: it only reports what it would do. Nothing is printed from credential files;
  .credentials.json is only tested for existence.

  NOT covered (not scriptable, use the manual steps of docs/testing/TEST_PLAN_0.26.1.md, section 0):
  the Claude desktop app (chat, Cowork, Code tab) and claude.ai on the web. Plugins and connectors
  there are managed in the Claude account or organisation.

.PARAMETER Apply
  Perform the changes. Without it the script is a dry run.

.PARAMETER ConfigDirs
  Extra config directories to include, besides the discovered ones.

.PARAMETER ProjectRoot
  Where project .mcp.json files are looked for (one level deep). Default C:\Develop\Projects.

.EXAMPLE
  .\Update-KinitroClients.ps1
  Dry run: report per config directory what would change.

.EXAMPLE
  .\Update-KinitroClients.ps1 -Apply
  Apply the changes in every discovered config directory.

.EXAMPLE
  .\Update-KinitroClients.ps1 -Apply -ConfigDirs 'D:\claude-work'

.NOTES
  Exit code 0 = everything clean, 1 = problems remain (or, in a dry run, changes are still due).
  Log file: %TEMP%\Update-KinitroClients_<timestamp>.log
  Works in Windows PowerShell 5.1 and PowerShell 7.
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$RemoveMcp,
    [string[]]$ConfigDirs = @(),
    [string]$ProjectRoot = 'C:\Develop\Projects'
)

$ErrorActionPreference = 'Continue'
$Marketplace       = 'kinitro-ai'
$MarketplaceSource = 'ThorstenHornung/kinitro.ai'
$PluginName        = 'kinitro'
$PluginId          = "$PluginName@$Marketplace"
$DeprecatedPlugins = @('kinitro-ai-em', 'kinitro-ai-test', 'kinitro-ai')
$DeprecatedMcp     = @('kinitro_ai', 'kinitro-ai', 'kinitro_ai_test', 'kinitro_ai_device', 'kinitro_ai_device_test')   # 'methos' and project servers are only reported, never removed

$LogFile = Join-Path $env:TEMP ('Update-KinitroClients_{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Log {
    param([string]$Text, [string]$Color = '')
    $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $Text
    Add-Content -Path $LogFile -Value $line
    if ($Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}

# Runs `claude <args>` with the given config dir. Returns @{ Code; Lines; Out } (stdout and stderr merged).
function Invoke-Claude {
    param([string]$ConfigDir, [string[]]$CliArgs, [switch]$StdoutOnly)
    $old = $env:CLAUDE_CONFIG_DIR
    $env:CLAUDE_CONFIG_DIR = $ConfigDir
    try {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        if ($StdoutOnly) { $raw = & claude @CliArgs 2>$null } else { $raw = & claude @CliArgs 2>&1 }
        $code = $LASTEXITCODE
        $ErrorActionPreference = $prev
    } catch {
        $raw = @($_.Exception.Message); $code = 1
    } finally {
        if ($null -eq $old) { Remove-Item Env:\CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue }
        else { $env:CLAUDE_CONFIG_DIR = $old }
    }
    $lines = @($raw | ForEach-Object { "$_" })
    Add-Content -Path $LogFile -Value ('  > claude ' + ($CliArgs -join ' ') + '  (rc=' + $code + ')')
    foreach ($l in $lines) { Add-Content -Path $LogFile -Value ('    ' + $l) }
    return @{ Code = $code; Lines = $lines; Out = ($lines -join "`n") }
}

function ConvertFrom-JsonSafe {
    param([string]$Text)
    try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

# Split "name@marketplace" into parts.
function Split-PluginId {
    param([string]$Id)
    $i = $Id.LastIndexOf('@')
    if ($i -lt 0) { return @{ Name = $Id; Marketplace = '' } }
    return @{ Name = $Id.Substring(0, $i); Marketplace = $Id.Substring($i + 1) }
}

function Get-InstalledPlugins {
    param([string]$ConfigDir)
    $r = Invoke-Claude -ConfigDir $ConfigDir -CliArgs @('plugin', 'list', '--json') -StdoutOnly
    $j = ConvertFrom-JsonSafe $r.Out
    if ($r.Code -ne 0 -or $null -eq $j) { return $null }
    return @($j)
}

function Get-DeprecatedPluginEntries {
    param($Installed)
    $found = @()
    foreach ($p in $Installed) {
        $parts = Split-PluginId $p.id
        $bad = ($DeprecatedPlugins -contains $parts.Name) -or ($parts.Name -eq $PluginName -and $parts.Marketplace -ne $Marketplace)
        if ($bad) { $found += $p }
    }
    return $found
}

# Names of user-scope MCP servers from `claude mcp list` ("name: target - status").
function Get-McpNames {
    param([string]$ConfigDir)
    $r = Invoke-Claude -ConfigDir $ConfigDir -CliArgs @('mcp', 'list') -StdoutOnly
    $names = @()
    foreach ($l in $r.Lines) {
        if ($l -match '^([^\s:][^:]*?):\s') { $names += $Matches[1].Trim() }
    }
    return $names
}

function Find-ConfigDirs {
    $set = New-Object System.Collections.Generic.List[string]
    $default = Join-Path $env:USERPROFILE '.claude'
    if (Test-Path -LiteralPath $default) { $set.Add($default) }
    $candidates = @()
    if (Test-Path -LiteralPath 'C:\Develop') { $candidates += @(Get-ChildItem -LiteralPath 'C:\Develop' -Directory -Filter 'claude-*' -ErrorAction SilentlyContinue) }
    $candidates += @(Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -Filter '.claude-*' -Force -ErrorAction SilentlyContinue)
    foreach ($c in $candidates) {
        $looks = (Test-Path -LiteralPath (Join-Path $c.FullName 'settings.json')) -or
                 (Test-Path -LiteralPath (Join-Path $c.FullName '.credentials.json')) -or
                 (Test-Path -LiteralPath (Join-Path $c.FullName 'plugins'))
        if ($looks) { $set.Add($c.FullName) }
    }
    foreach ($d in $ConfigDirs) {
        if (Test-Path -LiteralPath $d) { $set.Add((Resolve-Path -LiteralPath $d).Path) }
        else { Write-Log "Skipped -ConfigDirs entry (not found): $d" 'Yellow' }
    }
    $seen = @{}; $out = @()
    foreach ($d in $set) { $k = $d.TrimEnd('\').ToLowerInvariant(); if (-not $seen.ContainsKey($k)) { $seen[$k] = 1; $out += $d.TrimEnd('\') } }
    return $out
}

# Project .mcp.json files that name a kinitro server. Reported only.
function Get-ProjectMcpFindings {
    $hits = @()
    if (-not (Test-Path -LiteralPath $ProjectRoot)) { return $hits }
    foreach ($proj in @(Get-ChildItem -LiteralPath $ProjectRoot -Directory -ErrorAction SilentlyContinue)) {
        $f = Join-Path $proj.FullName '.mcp.json'
        if (-not (Test-Path -LiteralPath $f)) { continue }
        $j = $null
        try { $j = Get-Content -LiteralPath $f -Raw | ConvertFrom-Json } catch { }
        if ($null -eq $j -or $null -eq $j.mcpServers) { continue }
        $names = @($j.mcpServers.PSObject.Properties.Name | Where-Object { $_ -match 'kinitro' })
        if ($names.Count -gt 0) { $hits += ('{0}  ->  {1}' -f $f, ($names -join ', ')) }
    }
    return $hits
}

function Invoke-ConfigDir {
    param([string]$Dir)
    $row = [ordered]@{ Dir = $Dir; Claude = '?'; Before = '-'; After = '-'; Removed = @(); Problems = @() }
    Write-Log ''
    Write-Log "=== $Dir" 'Cyan'
    if (Test-Path -LiteralPath (Join-Path $Dir '.credentials.json')) { Write-Log '  credentials file present (content not read)' }

    # 1 version
    $v = Invoke-Claude -ConfigDir $Dir -CliArgs @('--version') -StdoutOnly
    if ($v.Code -ne 0) { $row.Problems += 'claude --version failed (is claude on PATH?)'; return [pscustomobject]$row }
    $row.Claude = (($v.Lines | Select-Object -First 1) -replace '\s*\(Claude Code\)', '').Trim()

    # 2 list
    $installed = Get-InstalledPlugins $Dir
    if ($null -eq $installed) { $row.Problems += 'plugin list failed'; return [pscustomobject]$row }
    $mkt = ConvertFrom-JsonSafe ((Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'marketplace', 'list', '--json') -StdoutOnly).Out)
    $mktNames = @(); if ($null -ne $mkt) { $mktNames = @($mkt | ForEach-Object { $_.name }) }
    $mine = @($installed | Where-Object { $_.id -eq $PluginId })
    if ($mine.Count -gt 0) { $row.Before = "$($mine[0].version)" }
    Write-Log ("  marketplaces: " + ($mktNames -join ', '))
    Write-Log ("  plugins: " + (@($installed | ForEach-Object { "$($_.id) $($_.version)" }) -join '; '))

    # 3 marketplace
    $haveMkt = $mktNames -contains $Marketplace
    if (-not $haveMkt) {
        if ($Apply) {
            $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'marketplace', 'add', $MarketplaceSource, '--json')
            if ($r.Code -ne 0) { $row.Problems += "marketplace add failed: $($r.Lines | Select-Object -Last 1)" } else { $haveMkt = $true; Write-Log "  + marketplace $Marketplace added" 'Green' }
        } else { Write-Log "  [dry] would add marketplace $Marketplace ($MarketplaceSource)" 'Yellow'; $row.Problems += 'marketplace kinitro-ai missing (dry run)' }
    }
    if ($haveMkt -and $Apply) {
        $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'marketplace', 'update', $Marketplace)
        if ($r.Code -ne 0) { $row.Problems += "marketplace update failed: $($r.Lines | Select-Object -Last 1)" }
    }

    # 4 deprecated plugins
    foreach ($p in (Get-DeprecatedPluginEntries $installed)) {
        $scope = 'user'; if ($p.scope) { $scope = "$($p.scope)" }
        if ($Apply) {
            $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'uninstall', $p.id, '-s', $scope, '--json')
            if ($r.Code -eq 0) { $row.Removed += "plugin $($p.id)"; Write-Log "  - plugin $($p.id) removed" 'Green' }
            else { $row.Problems += "uninstall $($p.id) ($scope) failed: $($r.Lines | Select-Object -Last 1)" }
        } else { $row.Removed += "plugin $($p.id) (would)"; Write-Log "  [dry] would uninstall $($p.id) (scope $scope)" 'Yellow' }
    }

    # 5 install or update
    $target = $null
    if ($haveMkt) {
        $av = ConvertFrom-JsonSafe ((Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'list', '--json', '--available') -StdoutOnly).Out)
        if ($null -ne $av -and $null -ne $av.available) {
            $hit = @($av.available | Where-Object { $_.pluginId -eq $PluginId })
            if ($hit.Count -gt 0) { $target = "$($hit[0].version)" }
        }
    }
    if ($Apply) {
        if ($mine.Count -eq 0) {
            $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'install', $PluginId, '-s', 'user', '--json')
            if ($r.Code -ne 0) { $row.Problems += "install failed: $($r.Lines | Select-Object -Last 1)" } else { Write-Log "  + $PluginId installed" 'Green' }
        } else {
            $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('plugin', 'update', $PluginId, '--json')
            if ($r.Code -ne 0) { $row.Problems += "update failed: $($r.Lines | Select-Object -Last 1)" }
        }
    } else {
        if ($mine.Count -eq 0) { Write-Log "  [dry] would install $PluginId" 'Yellow' }
        elseif ($target -and $target -ne $row.Before) { Write-Log "  [dry] would update $PluginId $($row.Before) -> $target" 'Yellow' }
    }

    # 6 MCP servers (user scope)
    $mcpNames = Get-McpNames $Dir
    Write-Log ("  mcp servers: " + ($mcpNames -join ', '))
    foreach ($n in $DeprecatedMcp) {
        if ($mcpNames -notcontains $n) { continue }
        if ($Apply -and $RemoveMcp) {
            $r = Invoke-Claude -ConfigDir $Dir -CliArgs @('mcp', 'remove', $n, '-s', 'user')
            if ($r.Code -eq 0) { $row.Removed += "mcp $n"; Write-Log "  - mcp server $n removed" 'Green' }
            else { $row.Problems += "mcp remove $n failed (maybe not user scope): $($r.Lines | Select-Object -Last 1)" }
        } elseif ($Apply) { $row.Problems += "mcp $n still configured: re-run with -RemoveMcp once no session on this machine relies on it"; Write-Log "  [kept] user MCP server $n (add -RemoveMcp to remove)" 'Yellow' }
        else { $row.Removed += "mcp $n (would, with -RemoveMcp)"; Write-Log "  [dry] would remove user MCP server $n with -RemoveMcp" 'Yellow' }
    }

    # 7 verify
    if ($Apply) {
        $after = Get-InstalledPlugins $Dir
        if ($null -eq $after) { $row.Problems += 'verify: plugin list failed' }
        else {
            $m = @($after | Where-Object { $_.id -eq $PluginId })
            if ($m.Count -eq 0) { $row.Problems += "verify: $PluginId not installed" }
            else {
                $row.After = "$($m[0].version)"
                if ($target -and $row.After -ne $target) { $row.Problems += "verify: version $($row.After), marketplace has $target" }
            }
            foreach ($p in (Get-DeprecatedPluginEntries $after)) { $row.Problems += "verify: still installed $($p.id)" }
        }
        foreach ($n in (Get-McpNames $Dir)) { if ($DeprecatedMcp -contains $n) { $row.Problems += "verify: MCP server $n still configured (not user scope? check project/local)" } }
    } else {
        $row.After = if ($target) { "$target (target)" } else { '?' }
        if ($row.Removed.Count -gt 0 -or $mine.Count -eq 0 -or ($target -and $target -ne $row.Before)) { $row.Problems += 'changes due (dry run)' }
    }
    return [pscustomobject]$row
}

# ---- main ----
Write-Log ("Update-KinitroClients  mode=" + $(if ($Apply) { 'APPLY' } else { 'DRY RUN' }) + "  log=$LogFile")
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Write-Log 'claude not found on PATH.' 'Red'; exit 1 }

$dirs = @(Find-ConfigDirs)
if ($dirs.Count -eq 0) { Write-Log 'No config directories found.' 'Red'; exit 1 }
Write-Log ("Config directories: " + ($dirs -join ' | '))

$rows = @()
foreach ($d in $dirs) { $rows += Invoke-ConfigDir $d }

Write-Log ''
Write-Log '=== Summary' 'Cyan'
$table = $rows | ForEach-Object {
    [pscustomobject]@{
        Dir      = $_.Dir
        Claude   = $_.Claude
        Before   = $_.Before
        After    = $_.After
        Removed  = ($_.Removed -join ', ')
        Problems = ($_.Problems -join '; ')
    }
}
($table | Format-Table -AutoSize -Wrap | Out-String -Width 200) | ForEach-Object { Write-Host $_; Add-Content -Path $LogFile -Value $_ }

$proj = @(Get-ProjectMcpFindings)
Write-Log 'Project .mcp.json files naming a kinitro server (reported, not changed):'
if ($proj.Count -eq 0) { Write-Log '  none' } else { foreach ($p in $proj) { Write-Log "  $p" 'Yellow' } }

Write-Log ''
Write-Log 'Manual steps still needed: Claude desktop app and claude.ai (see docs/testing/TEST_PLAN_0.26.1.md, section 0). Restart open Claude Code sessions.'
Write-Log "Log: $LogFile"

$problemCount = @($rows | ForEach-Object { $_.Problems } | Where-Object { $_ }).Count
if ($problemCount -gt 0) { exit 1 } else { exit 0 }
