@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0安裝艾琳ERP.ps1"
if errorlevel 1 pause
