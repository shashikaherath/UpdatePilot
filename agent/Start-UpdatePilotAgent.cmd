@echo off
REM UpdatePilot Windows Agent - Background Starter
REM Launches UpdatePilotAgent.ps1 silently without an interactive console prompt

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "UpdatePilotAgent.ps1" -AutoEnroll %*

