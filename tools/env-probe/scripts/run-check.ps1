param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Program,
    [string[]]$CommandArgs = @(),
    [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$probeRoot = Split-Path $PSScriptRoot -Parent
$evidenceRoot = Join-Path $probeRoot 'evidence'
$cacheRoot = Join-Path $probeRoot '.cache'
foreach ($dir in @($evidenceRoot, $cacheRoot, (Join-Path $cacheRoot 'tmp'))) {
    [void][IO.Directory]::CreateDirectory($dir)
}
$recordPath = Join-Path $evidenceRoot ($Name + '.json')
if (Test-Path -LiteralPath $recordPath) { throw "Evidence already exists: $Name" }
foreach ($file in @('npm-user.npmrc', 'npm-global.npmrc')) {
    $configPath = Join-Path $cacheRoot $file
    if (!(Test-Path -LiteralPath $configPath)) { [IO.File]::WriteAllText($configPath, '') }
}
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $Program
$startInfo.WorkingDirectory = $probeRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
$startInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
foreach ($arg in $CommandArgs) { $startInfo.ArgumentList.Add($arg) }
# Only child-process configuration. No global/user npm files are read by npm.
$startInfo.Environment['npm_config_cache'] = Join-Path $cacheRoot 'npm'
$startInfo.Environment['npm_config_userconfig'] = Join-Path $cacheRoot 'npm-user.npmrc'
$startInfo.Environment['npm_config_globalconfig'] = Join-Path $cacheRoot 'npm-global.npmrc'
$startInfo.Environment['npm_config_registry'] = 'https://registry.npmjs.org/'
$startInfo.Environment['npm_config_engine_strict'] = 'true'
$startInfo.Environment['PLAYWRIGHT_BROWSERS_PATH'] = Join-Path $cacheRoot 'browsers'
$startInfo.Environment['TEMP'] = Join-Path $cacheRoot 'tmp'
$startInfo.Environment['TMP'] = Join-Path $cacheRoot 'tmp'
$startInfo.Environment['NO_COLOR'] = '1'
$startedAt = [DateTimeOffset]::UtcNow
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
[void]$process.Start()
$outTask = $process.StandardOutput.ReadToEndAsync()
$errTask = $process.StandardError.ReadToEndAsync()
$timedOut = !$process.WaitForExit($TimeoutSeconds * 1000)
if ($timedOut) { $process.Kill($true); $process.WaitForExit() }
$stdout = $outTask.GetAwaiter().GetResult()
$stderr = $errTask.GetAwaiter().GetResult()
$exitCode = if ($timedOut) { 124 } else { $process.ExitCode }
$record = [ordered]@{
    name = $Name; cwd = $probeRoot; program = $Program; args = $CommandArgs
    startedAt = $startedAt.ToString('o'); endedAt = [DateTimeOffset]::UtcNow.ToString('o')
    timeoutSeconds = $TimeoutSeconds; timedOut = $timedOut; exitCode = $exitCode
    stdout = $stdout; stderr = $stderr
}
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output ($record | ConvertTo-Json -Depth 8 -Compress)
$process.Dispose()
exit $exitCode
