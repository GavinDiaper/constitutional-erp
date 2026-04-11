@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run-systems.ps1" %*
endlocal
