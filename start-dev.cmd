@echo off
REM Запуск TriagV3: Rails + этап 1 + этап 2
REM Можно двойным щелчком или из cmd: start-dev.cmd

set "ROOT=%~dp0"
powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%ROOT%scripts\start-dev.ps1" %*
