[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ExtensionRoot = Join-Path $RepoRoot "apps\extension"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

Write-Host "仓库目录：$RepoRoot"
Write-Host "正在安装 Extension 开发依赖……"
Push-Location $ExtensionRoot
try {
    & $Npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败，退出码：$LASTEXITCODE" }
}
finally { Pop-Location }
Write-Host "[通过] Extension 依赖安装完成"
