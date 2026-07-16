[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$DesktopDirectory = Join-Path $RepoRoot "apps\desktop"
$PreferredTempParent = Join-Path $RepoRoot ".pytest-tmp"

if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
    throw "未找到项目虚拟环境。请先运行 $RepoRoot\scripts\setup.ps1"
}

function Test-WritableDirectory {
    param([string]$Path)

    try {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        $Probe = Join-Path $Path "write-probe-$PID"
        New-Item -ItemType Directory -Path $Probe | Out-Null
        Remove-Item -LiteralPath $Probe
        return $true
    }
    catch {
        return $false
    }
}

if (Test-WritableDirectory $PreferredTempParent) {
    $TempParent = $PreferredTempParent
}
else {
    $TempParent = Join-Path $RepoRoot ".pytest-tmp-fallback-$PID"
    New-Item -ItemType Directory -Force -Path $TempParent | Out-Null
    Write-Warning ".pytest-tmp 不可写，改用仓库内临时目录：$TempParent"
}
$BaseTemp = Join-Path $TempParent "run-$PID"

function Invoke-Check {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "正在运行：$Name"
    & $VenvPython @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Name 失败，退出码：$LASTEXITCODE"
    }
    Write-Host "[通过] $Name"
}

Push-Location $RepoRoot
try {
    Invoke-Check "pytest" @(
        "-m", "pytest", "apps/desktop/tests",
        "--basetemp=$BaseTemp", "-p", "no:cacheprovider"
    )
    Invoke-Check "ruff check" @(
        "-m", "ruff", "check", "--no-cache", $DesktopDirectory
    )
    Invoke-Check "ruff format --check" @(
        "-m", "ruff", "format", "--check", "--no-cache", $DesktopDirectory
    )
    Invoke-Check "mypy" @(
        "-m", "mypy", "--cache-dir", (Join-Path $TempParent "mypy-$PID"),
        "apps/desktop/src"
    )
}
finally {
    Pop-Location
}

Write-Host "测试临时目录：$BaseTemp"
Write-Host "[通过] 全部自动检查完成"
