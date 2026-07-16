[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$VenvDirectory = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvDirectory "Scripts\python.exe"
$DesktopProject = Join-Path $RepoRoot "apps\desktop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败，退出码：$LASTEXITCODE"
    }
}

Write-Host "仓库目录：$RepoRoot"
if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
    Write-Host "正在创建虚拟环境：$VenvDirectory"
    Invoke-NativeCommand -Executable "python" -Arguments @(
        "-m", "venv", $VenvDirectory
    )
}
else {
    Write-Host "使用已有虚拟环境：$VenvDirectory"
}

Write-Host "正在安装 Desktop 开发依赖……"
Invoke-NativeCommand -Executable $VenvPython -Arguments @(
    "-m", "pip", "install", "-e", "$DesktopProject[dev]"
)
Write-Host "[通过] 安装完成"
