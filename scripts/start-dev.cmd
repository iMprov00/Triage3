@echo off
REM Запуск из папки scripts (обходит ExecutionPolicy)
powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
