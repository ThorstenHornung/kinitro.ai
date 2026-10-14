#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$ReportPath,
    [string]$CodexExe
)
$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if (-not $ReportPath) { $ReportPath = Join-Path $RepositoryRoot '.artifacts/codex-plugin/junit.xml' }
$results = [System.Collections.Generic.List[object]]::new()

function Test-Check([string]$Name, [scriptblock]$Check) {
    try { & $Check; $results.Add([pscustomobject]@{Name=$Name; Error=$null}) }
    catch { $results.Add([pscustomobject]@{Name=$Name; Error=$_.Exception.Message}) }
}
function Assert-That([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Read-Json([string]$RelativePath) {
    Get-Content -LiteralPath (Join-Path $RepositoryRoot $RelativePath) -Raw | ConvertFrom-Json
}
function Assert-MethosConnection($Server) {
    Assert-That ($Server.type -eq 'http') 'Expected HTTP transport'
    Assert-That ($Server.url -ceq 'https://methos.kinitro.ai/mcp') 'Expected the canonical MethOS resource'
    Assert-That ($Server.oauth.clientId -ceq 'https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json') 'Expected the plugin OAuth client'
    Assert-That ($Server.oauth.callbackUrl -ceq 'http://127.0.0.1:33419/callback') 'Wrong callback URL'
    Assert-That ($Server.oauth.callbackPort -eq 33419) 'Wrong callback listener port'
    Assert-That (-not $Server.PSObject.Properties['headers']) 'Static credential headers must not be packaged'
    Assert-That (-not $Server.oauth.PSObject.Properties['clientSecret']) 'Client secrets must not be packaged'
}
Test-Check 'manifest-and-resources' {
    $manifest = Read-Json 'plugins/kinitro-ai-codex/.codex-plugin/plugin.json'
    Assert-That ($manifest.name -eq 'kinitro-ai-codex') 'Wrong plugin identity'
    Assert-That ($manifest.version -match '^\d+\.\d+\.\d+$') 'Invalid version'
    foreach ($resource in @($manifest.skills, $manifest.mcpServers)) {
        Assert-That ($resource.StartsWith('./')) 'Resource path must be relative to plugin root'
        $resolved = [IO.Path]::GetFullPath((Join-Path (Join-Path $RepositoryRoot 'plugins/kinitro-ai-codex') $resource))
        $packageRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot 'plugins/kinitro-ai-codex')) + [IO.Path]::DirectorySeparatorChar
        Assert-That ($resolved.StartsWith($packageRoot,[StringComparison]::OrdinalIgnoreCase)) 'Resource escapes plugin root'
        Assert-That (Test-Path -LiteralPath $resolved) "Missing resource: $resource"
    }
}
Test-Check 'methos-oauth-connection' {
    $mcp = Read-Json 'plugins/kinitro-ai-codex/.mcp.json'
    Assert-That ($mcp.mcpServers.PSObject.Properties.Count -eq 1) 'Expected one bundled MCP server'
    Assert-MethosConnection $mcp.mcpServers.kinitro_ai
}
Test-Check 'published-client-metadata' {
    $client = Read-Json 'plugins/kinitro-ai-codex/oauth/client.json'
    $server = (Read-Json 'plugins/kinitro-ai-codex/.mcp.json').mcpServers.kinitro_ai
    Assert-That ($client.client_id -ceq $server.oauth.clientId) 'Client document identity mismatch'
    Assert-That (@($client.redirect_uris).Count -eq 1) 'Expected one exact redirect'
    Assert-That ($client.redirect_uris[0] -ceq $server.oauth.callbackUrl) 'Published callback mismatch'
    Assert-That ($client.token_endpoint_auth_method -eq 'none') 'Expected a public client'
}
Test-Check 'counterprobe-wrong-callback' {
    $server = (Read-Json 'plugins/kinitro-ai-codex/.mcp.json').mcpServers.kinitro_ai
    $server.oauth.callbackPort = 33418
    $rejected = $false
    try { Assert-MethosConnection $server } catch { $rejected = $true }
    Assert-That $rejected 'Wrong callback port was incorrectly accepted'
}
Test-Check 'marketplace-path' {
    $catalog = Read-Json '.agents/plugins/marketplace.json'
    Assert-That ($catalog.name -eq 'kinitro-ai-codex') 'Wrong marketplace identity'
    $entry = @($catalog.plugins | Where-Object name -eq 'kinitro-ai-codex')
    Assert-That ($entry.Count -eq 1) 'Expected one matching entry'
    Assert-That ($entry[0].source.source -eq 'local') 'Expected repo-local package'
    Assert-That ($entry[0].source.path -eq './plugins/kinitro-ai-codex') 'Marketplace path must resolve from repo root'
}
Test-Check 'skill-and-reference' {
    $skill = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'plugins/kinitro-ai-codex/skills/kinitro/SKILL.md') -Raw
    Assert-That ($skill -match '(?s)^---\r?\nname: kinitro\r?\ndescription: [^\r\n]+\r?\n---') 'Required skill frontmatter is missing'
    Assert-That (Test-Path -LiteralPath (Join-Path $RepositoryRoot 'plugins/kinitro-ai-codex/skills/kinitro/references/connection.md')) 'Connection reference missing'
    Assert-That (-not ($skill -match '~~[A-Za-z]|\bTODO\b|\bTBD\b')) 'Unfinished skill scaffold'
}
Test-Check 'counterprobe-wrong-resource' {
    $server = (Read-Json 'plugins/kinitro-ai-codex/.mcp.json').mcpServers.kinitro_ai
    $server.url = 'https://example.invalid/mcp'
    $rejected = $false
    try { Assert-MethosConnection $server } catch { $rejected = $true }
    Assert-That $rejected 'A broken MCP resource was incorrectly accepted'
}
Test-Check 'counterprobe-claude-client' {
    $server = (Read-Json 'plugins/kinitro-ai-codex/.mcp.json').mcpServers.kinitro_ai
    $server.oauth.clientId = 'claude-code'
    $rejected = $false
    try { Assert-MethosConnection $server } catch { $rejected = $true }
    Assert-That $rejected 'Claude OAuth identity was incorrectly accepted'
}
if ($CodexExe) {
    Test-Check 'codex-install-and-mcp-discovery' {
        Assert-That (Test-Path -LiteralPath $CodexExe) 'Codex executable missing'
        $testHome = Join-Path $RepositoryRoot ('.artifacts/codex-plugin/home-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $testHome -Force | Out-Null
        $previousHome = $env:CODEX_HOME
        try {
            $env:CODEX_HOME = $testHome
            $marketText = & $CodexExe plugin marketplace add $RepositoryRoot --json
            Assert-That ($LASTEXITCODE -eq 0) 'Codex marketplace add failed'
            $market = ($marketText -join "`n") | ConvertFrom-Json
            Assert-That ($market.marketplaceName -eq 'kinitro-ai-codex') 'Codex resolved another marketplace'
            $installText = & $CodexExe plugin add kinitro-ai-codex@kinitro-ai-codex --json
            Assert-That ($LASTEXITCODE -eq 0) 'Codex plugin install failed'
            $install = ($installText -join "`n") | ConvertFrom-Json
            Assert-That ($install.pluginId -eq 'kinitro-ai-codex@kinitro-ai-codex') 'Wrong installed plugin'
            $serversText = & $CodexExe mcp list --json
            Assert-That ($LASTEXITCODE -eq 0) 'Codex MCP discovery failed'
            $servers = @((($serversText -join "`n") | ConvertFrom-Json) | Where-Object name -eq 'kinitro_ai')
            Assert-That ($servers.Count -eq 1) 'Bundled MCP server was not discovered'
            Assert-That ($servers[0].transport.url -eq 'https://methos.kinitro.ai/mcp') 'Installed server points elsewhere'
            $installedConfig = Get-Content -LiteralPath (Join-Path $install.installedPath '.mcp.json') -Raw | ConvertFrom-Json
            Assert-MethosConnection $installedConfig.mcpServers.kinitro_ai
            Write-Output "Codex installed package and discovered MethOS MCP in isolated profile"
        } finally { $env:CODEX_HOME = $previousHome }
    }
}
$failed = @($results | Where-Object Error).Count
$xml = [System.Xml.XmlDocument]::new()
$suite = $xml.CreateElement('testsuite')
$suite.SetAttribute('name','kinitro-ai-codex-package')
$suite.SetAttribute('tests',[string]$results.Count)
$suite.SetAttribute('failures',[string]$failed)
[void]$xml.AppendChild($suite)
foreach ($result in $results) {
    $case = $xml.CreateElement('testcase')
    $case.SetAttribute('name',$result.Name)
    if ($result.Error) {
        $failure = $xml.CreateElement('failure')
        $failure.SetAttribute('message',$result.Error)
        $failure.InnerText = $result.Error
        [void]$case.AppendChild($failure)
    }
    [void]$suite.AppendChild($case)
}
New-Item -ItemType Directory -Path (Split-Path $ReportPath -Parent) -Force | Out-Null
$xml.Save([IO.Path]::GetFullPath($ReportPath))
Write-Output "JUnit evidence: $ReportPath"
if ($failed -gt 0) { exit 1 }
