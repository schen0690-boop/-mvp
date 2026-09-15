param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Program,
    [string[]]$CommandArgs = @(),
    [string]$Stage = 'stage-2',
    [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$evidenceRoot = Join-Path $projectRoot ('evidence/' + $Stage)
$cacheRoot = Join-Path $projectRoot '.cache'
foreach ($dir in @($evidenceRoot, $cacheRoot, (Join-Path $cacheRoot 'tmp'))) {
    [void][IO.Directory]::CreateDirectory($dir)
}
$recordPath = Join-Path $evidenceRoot ($Name + '.json')
if (Test-Path -LiteralPath $recordPath) { throw "Evidence already exists: $Name" }
foreach ($file in @('npm-user.npmrc', 'npm-global.npmrc')) {
    $configPath = Join-Path $cacheRoot $file
    if (!(Test-Path -LiteralPath $configPath)) { [IO.File]::WriteAllText($configPath, '') }
}
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = $Program
$info.WorkingDirectory = $projectRoot
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
$info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
foreach ($argument in $CommandArgs) { $info.ArgumentList.Add($argument) }
$info.Environment['npm_config_cache'] = Join-Path $cacheRoot 'npm'
$info.Environment['npm_config_userconfig'] = Join-Path $cacheRoot 'npm-user.npmrc'
$info.Environment['npm_config_globalconfig'] = Join-Path $cacheRoot 'npm-global.npmrc'
$info.Environment['npm_config_registry'] = 'https://registry.npmjs.org/'
$info.Environment['npm_config_engine_strict'] = 'true'
$info.Environment['TEMP'] = Join-Path $cacheRoot 'tmp'
$info.Environment['TMP'] = Join-Path $cacheRoot 'tmp'
$info.Environment['NO_COLOR'] = '1'
$startedAt = [DateTimeOffset]::UtcNow
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
[void]$process.Start()
$outTask = $process.StandardOutput.ReadToEndAsync()
$errTask = $process.StandardError.ReadToEndAsync()
$timedOut = !$process.WaitForExit($TimeoutSeconds * 1000)
if ($timedOut) { $process.Kill($true); $process.WaitForExit() }
$stdout = $outTask.GetAwaiter().GetResult()
$stderr = $errTask.GetAwaiter().GetResult()
$code = if ($timedOut) { 124 } else { $process.ExitCode }
$hashes = [ordered]@{}
foreach ($folder in @('src', 'tests', 'web', 'e2e')) {
    $path = Join-Path $projectRoot $folder
    if (Test-Path -LiteralPath $path) {
        Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](dist|node_modules)[\\/]' } | Sort-Object FullName | ForEach-Object {
            $hashes[[IO.Path]::GetRelativePath($projectRoot, $_.FullName)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
}
$record = [ordered]@{
    name=$Name; cwd=$projectRoot; program=$Program; args=$CommandArgs
    startedAt=$startedAt.ToString('o'); endedAt=[DateTimeOffset]::UtcNow.ToString('o')
    timedOut=$timedOut; exitCode=$code; stdout=$stdout; stderr=$stderr; sourceHashes=$hashes
}
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output ($record | ConvertTo-Json -Depth 8 -Compress)
$process.Dispose()
exit $code
