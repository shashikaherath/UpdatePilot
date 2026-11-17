@echo off
REM =========================================================================
REM UpdatePilot Windows Agent - 1-Click Setup Launcher
REM Launches the native GUI consent and pairing screen
REM =========================================================================

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "UpdatePilotAgent.ps1" -ResetCredentials -GUI %*

