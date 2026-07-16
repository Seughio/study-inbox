[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [string]$DataDirectory = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ([string]::IsNullOrWhiteSpace($DataDirectory)) {
    $DataDirectory = Join-Path $RepoRoot ".demo-data"
}
$DataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
$ExpectedDatabase = [System.IO.Path]::GetFullPath(
    (Join-Path $DataDirectory "study-inbox.sqlite3")
)
$ExpectedExportDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $DataDirectory "markdown")
)
$FixtureDirectory = Join-Path $RepoRoot "fixtures\conversations"
$script:FailureCount = 0

function Write-Pass {
    param([string]$Message)
    Write-Host "[通过] $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    $script:FailureCount++
    Write-Host "[失败] $Message" -ForegroundColor Red
}

function Invoke-DemoCheck {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    try {
        & $Action
        Write-Pass $Name
    }
    catch {
        Write-Failure "$Name：$($_.Exception.Message)"
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Read-Fixture {
    param([string]$Name)
    $Path = Join-Path $FixtureDirectory $Name
    return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
}

function Submit-Conversation {
    param([object]$Payload)
    $Body = $Payload | ConvertTo-Json -Depth 10
    return Invoke-RestMethod -Method Post `
        -Uri "$BaseUrl/api/v1/conversations" `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($Body)) `
        -TimeoutSec 10
}

Write-Host "Study Inbox Milestone 1.5 黑箱演示"
Write-Host "期望数据库：$ExpectedDatabase"
Write-Host "期望 Markdown：$ExpectedExportDirectory"

try {
    $script:Health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health" -TimeoutSec 5
    Write-Pass "本地服务可访问"
}
catch {
    Write-Failure "本地服务不可访问，请先运行 scripts\start.ps1"
    exit 1
}

$ActualDatabase = [System.IO.Path]::GetFullPath([string]$Health.database_path)
$ActualExportDirectory = [System.IO.Path]::GetFullPath([string]$Health.export_directory)
$DatabaseIsSafe = [string]::Equals(
    $ActualDatabase, $ExpectedDatabase, [System.StringComparison]::OrdinalIgnoreCase
)
$ExportIsSafe = [string]::Equals(
    $ActualExportDirectory,
    $ExpectedExportDirectory,
    [System.StringComparison]::OrdinalIgnoreCase
)
if (-not ($DatabaseIsSafe -and $ExportIsSafe)) {
    Write-Failure "服务未使用预期 demo 数据目录，为保护用户数据已停止演示"
    Write-Host "服务数据库：$ActualDatabase"
    Write-Host "服务 Markdown：$ActualExportDirectory"
    exit 1
}
Write-Pass "服务使用独立 demo 数据目录"

$RunId = "demo-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$([guid]::NewGuid().ToString('N').Substring(0, 6))"
$LearningMarker = "热力学演示标记-$RunId"
$AiMarker = "人工智能演示标记-$RunId"
$NonLearningMarker = "午餐演示标记-$RunId"
$Learning = Read-Fixture "learning-thermodynamics.json"
$Learning.event_id = "$RunId-thermodynamics"
$Learning.conversation_id = $RunId
$Learning.question = "$($Learning.question) $LearningMarker"
$AiLearning = Read-Fixture "learning-ai.json"
$AiLearning.event_id = "$RunId-ai"
$AiLearning.conversation_id = $RunId
$AiLearning.question = "$($AiLearning.question) $AiMarker"
$NonLearning = Read-Fixture "non-learning.json"
$NonLearning.event_id = "$RunId-non-learning"
$NonLearning.conversation_id = $RunId
$NonLearning.question = "$($NonLearning.question) $NonLearningMarker"

Invoke-DemoCheck "提交热力学学习问答" {
    $script:LearningResult = Submit-Conversation $Learning
    Assert-True ($LearningResult.created -eq $true) "首次提交未返回 created=true"
    Assert-True ($LearningResult.conversation.subject -eq "physics") "未分类为 physics"
}
Invoke-DemoCheck "重复 event_id 被去重" {
    $script:DuplicateResult = Submit-Conversation $Learning
    Assert-True ($DuplicateResult.created -eq $false) "重复提交未返回 created=false"
}
Invoke-DemoCheck "提交非学习问答" {
    $script:NonLearningResult = Submit-Conversation $NonLearning
    Assert-True ($NonLearningResult.created -eq $true) "非学习问答写入失败"
    Assert-True ($NonLearningResult.conversation.is_learning -eq $false) "非学习问答被误判"
}
Invoke-DemoCheck "提交人工智能学习问答" {
    $script:AiResult = Submit-Conversation $AiLearning
    Assert-True ($AiResult.created -eq $true) "人工智能问答写入失败"
    Assert-True ($AiResult.conversation.subject -eq "computer-science") "未分类为 computer-science"
}
Invoke-DemoCheck "查询已保存记录" {
    $script:Saved = Invoke-RestMethod -Method Get `
        -Uri "$BaseUrl/api/v1/conversations" -TimeoutSec 10
    $OwnRecords = @($Saved | Where-Object { $_.conversation_id -eq $RunId })
    Assert-True ($OwnRecords.Count -eq 3) "本轮应保存 3 条不同 event_id 的记录"
}
Invoke-DemoCheck "调用 Markdown 导出接口" {
    $script:ExportResult = Invoke-RestMethod -Method Post `
        -Uri "$BaseUrl/api/v1/export/markdown" -TimeoutSec 10
    Assert-True ($ExportResult.conversation_count -ge 2) "学习记录导出数量不足"
}

$PhysicsPath = Join-Path $ActualExportDirectory "physics.md"
$ComputerSciencePath = Join-Path $ActualExportDirectory "computer-science.md"
Invoke-DemoCheck "生成预期学科 Markdown" {
    Assert-True (Test-Path -LiteralPath $PhysicsPath -PathType Leaf) "缺少 physics.md"
    Assert-True (Test-Path -LiteralPath $ComputerSciencePath -PathType Leaf) `
        "缺少 computer-science.md"
}
Invoke-DemoCheck "学习内容已写入 Markdown" {
    $script:PhysicsMarkdown = Get-Content -Raw -Encoding UTF8 -LiteralPath $PhysicsPath
    $script:ComputerScienceMarkdown = Get-Content `
        -Raw -Encoding UTF8 -LiteralPath $ComputerSciencePath
    Assert-True ($PhysicsMarkdown.Contains($LearningMarker)) "热力学内容不存在"
    Assert-True ($ComputerScienceMarkdown.Contains($AiMarker)) "人工智能内容不存在"
}
Invoke-DemoCheck "重复内容只导出一次" {
    $MarkerCount = ([regex]::Matches(
        $PhysicsMarkdown, [regex]::Escape($LearningMarker)
    )).Count
    $EventCount = ([regex]::Matches(
        $PhysicsMarkdown, [regex]::Escape($Learning.event_id)
    )).Count
    Assert-True ($MarkerCount -eq 1) "重复学习内容出现 $MarkerCount 次"
    Assert-True ($EventCount -eq 1) "重复 event_id 出现 $EventCount 次"
}
Invoke-DemoCheck "非学习内容没有导出" {
    $AllMarkdown = (Get-ChildItem -LiteralPath $ActualExportDirectory -Filter "*.md" |
        ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }) -join "`n"
    Assert-True (-not $AllMarkdown.Contains($NonLearningMarker)) "发现非学习内容"
}

Write-Host "数据库：$ActualDatabase"
Write-Host "Markdown：$ActualExportDirectory"
if ($FailureCount -gt 0) {
    Write-Host "演示结束：$FailureCount 项失败" -ForegroundColor Red
    exit 1
}
Write-Host "演示结束：全部项目通过" -ForegroundColor Green
exit 0
