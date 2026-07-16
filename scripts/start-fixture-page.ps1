[CmdletBinding()]
param([int]$Port = 4173)

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$FixtureRoot = Join-Path $RepoRoot "apps\extension\fixtures"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$Python = if (Test-Path -LiteralPath $VenvPython -PathType Leaf) {
    $VenvPython
} else {
    (Get-Command python.exe -ErrorAction Stop).Source
}

Write-Host "本地模拟页：http://127.0.0.1:$Port"
Write-Host "页面目录：$FixtureRoot"
Write-Host "按 Ctrl+C 停止。"
& $Python -m http.server $Port --bind 127.0.0.1 --directory $FixtureRoot
if ($LASTEXITCODE -ne 0) { throw "模拟页服务异常退出，退出码：$LASTEXITCODE" }
