[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ExtensionRoot = Join-Path $RepoRoot "apps\extension"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

Push-Location $ExtensionRoot
try {
    & $Npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "TypeScript 类型检查失败" }
    & $Npm run build
    if ($LASTEXITCODE -ne 0) { throw "Extension 构建失败" }
}
finally { Pop-Location }
Write-Host "[通过] Extension 已构建：$ExtensionRoot\dist"
