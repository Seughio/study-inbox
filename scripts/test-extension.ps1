[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ExtensionRoot = Join-Path $RepoRoot "apps\extension"
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source

function Invoke-NpmCheck {
    param([string]$Name, [string[]]$Arguments)
    Write-Host "正在运行：$Name"
    & $Npm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name 失败，退出码：$LASTEXITCODE" }
    Write-Host "[通过] $Name"
}

Push-Location $ExtensionRoot
try {
    Invoke-NpmCheck "Extension tests" @("test")
    Invoke-NpmCheck "TypeScript typecheck" @("run", "typecheck")
    Invoke-NpmCheck "ESLint" @("run", "lint")
}
finally { Pop-Location }
Write-Host "[通过] Extension 全部自动检查完成"
