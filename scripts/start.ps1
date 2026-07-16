[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$DataDirectory = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
    throw "未找到项目虚拟环境。请先运行 $RepoRoot\scripts\setup.ps1"
}

if ([string]::IsNullOrWhiteSpace($DataDirectory)) {
    $DataDirectory = Join-Path $RepoRoot ".demo-data"
}
$DataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
$DatabasePath = Join-Path $DataDirectory "study-inbox.sqlite3"
$ExportDirectory = Join-Path $DataDirectory "markdown"
New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null

$env:STUDY_INBOX_DATA_DIR = $DataDirectory
$env:STUDY_INBOX_DATABASE = $DatabasePath
$env:STUDY_INBOX_EXPORT_DIR = $ExportDirectory

Write-Host "Study Inbox 本地服务"
Write-Host "服务地址：http://127.0.0.1:$Port"
Write-Host "接口文档：http://127.0.0.1:$Port/docs"
Write-Host "数据库：$DatabasePath"
Write-Host "Markdown：$ExportDirectory"
Write-Host "按 Ctrl+C 停止服务。"

& $VenvPython -m uvicorn study_inbox.app:create_app --factory `
    --host 127.0.0.1 --port $Port
if ($LASTEXITCODE -ne 0) {
    throw "服务异常退出，退出码：$LASTEXITCODE"
}
