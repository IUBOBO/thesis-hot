# 注册 Windows 计划任务，让站点自己更新、重启后也能恢复（不需要管理员权限）
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-daily-tasks.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-daily-tasks.ps1 -Remove
#
# 任务：
#   ThesisNH-Postgres     登录时启动 D:\pg 便携版数据库
#   ThesisNH-Worker       登录时启动 worker（抓 arXiv、处理队列、热度、日报）
#   ThesisNH-Api          登录时启动接口（3001）
#   ThesisNH-Web          登录时启动网页（3000）
# 期刊和会议不放这里：它们的定时任务在 worker 里（journals 模块的 schedules），
# worker 常驻时每天 07:30 / 17:30 抓期刊、08:30 抓会议；Windows 任务只需要把常驻进程拉起来。
param([switch]$Remove)

$repo = Split-Path -Parent $PSScriptRoot
$pg = 'D:\pg\pgsql\bin\pg_ctl.exe'
$data = 'D:\pg\data'
$log = 'D:\pg\pg.log'
$node = 'D:\node24\node-v24.14.0-win-x64\node.exe'
$taskNames = @('ThesisNH-Postgres', 'ThesisNH-Worker', 'ThesisNH-Api', 'ThesisNH-Web')

if ($Remove) {
  foreach ($name in $taskNames) {
    schtasks /Delete /TN $name /F 2>$null | Out-Null
    Write-Host "removed $name"
  }
  return
}

function Register-ThesisTask {
  param([string]$Name, [string]$Script, [string]$Description, $Trigger, [string]$Command = 'powershell.exe')
  $argument = if ($Command -eq 'powershell.exe') { "-NoProfile -WindowStyle Hidden -Command `"$Script`"" } else { $Script }
  $action = New-ScheduledTaskAction -Execute $Command -Argument $argument -WorkingDirectory $repo
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $Trigger -Settings $settings -Description $Description -Force | Out-Null
  Write-Host "registered $Name"
}

# 1) 登录时启动数据库（已在跑就跳过）
$pgCmd = "if (-not (Test-NetConnection 127.0.0.1 -Port 5432 -InformationLevel Quiet)) { & '$pg' -D '$data' -l '$log' start }"
Register-ThesisTask -Name 'ThesisNH-Postgres' -Script $pgCmd -Description '启动 Thesis NH 的本地 PostgreSQL（D:\pg）' -Trigger (New-ScheduledTaskTrigger -AtLogOn)

# 2) 登录时启动常驻进程：worker、接口、网页
Register-ThesisTask -Name 'ThesisNH-Worker' -Script "& '$node' --env-file=.env apps/worker/src/main.ts" -Description 'Thesis NH worker：采集、分析、热度、日报' -Trigger (New-ScheduledTaskTrigger -AtLogOn)
Register-ThesisTask -Name 'ThesisNH-Api' -Script "& '$node' --env-file=.env apps/api/src/main.ts" -Description 'Thesis NH 接口（3001）' -Trigger (New-ScheduledTaskTrigger -AtLogOn)
Register-ThesisTask -Name 'ThesisNH-Web' -Script "& '$node' --env-file=.env apps/web/server.ts" -Description 'Thesis NH 网页（3000）' -Trigger (New-ScheduledTaskTrigger -AtLogOn)

Write-Host ''
Write-Host '查看：schtasks /Query /TN ThesisNH-Worker /V /FO LIST'
