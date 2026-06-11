# TriagV3 dev launcher: Rails :3000, stage1 :5173, stage2 :5174
#
# Run from project root:
#   start-dev.cmd
#   start-dev.cmd -ForceKillPorts
#
# Or:
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1

param(
    [switch]$ForceKillPorts
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ApiDir = Join-Path $ProjectRoot "api"
$Client1Dir = Join-Path $ProjectRoot "client"
$Client2Dir = Join-Path $ProjectRoot "client-stage2"
$RailsPidFile = Join-Path $ApiDir "tmp\pids\server.pid"

function Write-Info([string]$Message) {
    Write-Host "[start-dev] $Message" -ForegroundColor Cyan
}

function Write-WarnMsg([string]$Message) {
    Write-Host "[start-dev] $Message" -ForegroundColor Yellow
}

function Remove-StaleRailsPidFile {
    if (-not (Test-Path $RailsPidFile)) {
        return
    }

    $raw = (Get-Content $RailsPidFile -Raw).Trim()
    if ($raw -notmatch '^\d+$') {
        Remove-Item $RailsPidFile -Force
        Write-WarnMsg "Removed invalid PID file: $RailsPidFile"
        return
    }

    $railsPid = [int]$raw
    $proc = Get-Process -Id $railsPid -ErrorAction SilentlyContinue
    if (-not $proc) {
        Remove-Item $RailsPidFile -Force
        Write-WarnMsg "Removed stale PID file (process $railsPid not found)"
        return
    }

    Write-Info "Rails already running (PID $railsPid). PID file kept."
}

function Get-PortOwnerPid([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
    return $null
}

function Stop-ProcessOnPort([int]$Port, [string]$Label) {
    $ownerPid = Get-PortOwnerPid $Port
    if (-not $ownerPid) { return }

    $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "?" }

    if ($ForceKillPorts) {
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        Write-WarnMsg "Stopped process on port ${Port} (${Label}): PID $ownerPid ($name)"
        Start-Sleep -Milliseconds 500
    } else {
        Write-WarnMsg "Port $Port is in use (${Label}): PID $ownerPid ($name). Re-run with -ForceKillPorts or close the process."
    }
}

function Start-DevWindow([string]$Title, [string]$WorkingDir, [string]$Command) {
    $inner = @(
        "`$Host.UI.RawUI.WindowTitle = '$Title'"
        "Write-Host '>>> $Title' -ForegroundColor Green"
        "Write-Host '>>> $Command' -ForegroundColor DarkGray"
        $Command
    ) -join "; "

    Start-Process -FilePath "powershell.exe" -WorkingDirectory $WorkingDir -ArgumentList @(
        "-NoExit",
        "-NoLogo",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $inner
    ) | Out-Null

    Write-Info "Started window: $Title"
}

Write-Info "Project root: $ProjectRoot"

Remove-StaleRailsPidFile
Stop-ProcessOnPort -Port 3000 -Label "Rails API"
Stop-ProcessOnPort -Port 5173 -Label "Stage 1"
Stop-ProcessOnPort -Port 5174 -Label "Stage 2"
Remove-StaleRailsPidFile

Start-DevWindow -Title "TriagV3 - Rails API :3000" -WorkingDir $ApiDir -Command "bundle exec rails server"
Start-Sleep -Seconds 2
Start-DevWindow -Title "TriagV3 - Stage 1 :5173" -WorkingDir $Client1Dir -Command "npm run dev"
Start-DevWindow -Title "TriagV3 - Stage 2 :5174" -WorkingDir $Client2Dir -Command "npm run dev"

Write-Host ""
Write-Info "Ready. Open in browser:"
Write-Host "  Stage 1: http://localhost:5173"
Write-Host "  Stage 2: http://localhost:5174"
Write-Host "  API:     http://localhost:3000"
Write-Host ""
Write-Host "If ports are still busy:"
Write-Host "  start-dev.cmd -ForceKillPorts"
