@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0truncate-logs.ps1" %*
exit /b %ERRORLEVEL%
