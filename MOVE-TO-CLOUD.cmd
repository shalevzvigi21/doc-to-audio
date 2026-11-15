@echo off
REM Double-click this to move your local documents to the cloud account.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MOVE-TO-CLOUD.ps1"
if errorlevel 1 pause
