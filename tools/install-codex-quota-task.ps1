[CmdletBinding()]
param(
  [string]$GistId = "8292011e3b19e909282822590a696b8a",
  [ValidateRange(2, 60)]
  [int]$IntervalMinutes = 5,
  [string]$TaskName = "ZongTech Codex Quota Publisher",
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$publisher = Join-Path $PSScriptRoot "publish-codex-quota.mjs"
$node = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $publisher -PathType Leaf)) {
  throw "Quota publisher not found: $publisher"
}

$arguments = '"' + $publisher + '" --gist-id ' + $GistId
$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument $arguments `
  -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
  -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Publishes a sanitized Codex weekly quota snapshot for zongtech.xyz." `
  -Force | Out-Null

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $TaskName
}

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[PSCustomObject]@{
  TaskName = $TaskName
  State = $task.State
  LastRunTime = $info.LastRunTime
  NextRunTime = $info.NextRunTime
  IntervalMinutes = $IntervalMinutes
  Publisher = $publisher
}
