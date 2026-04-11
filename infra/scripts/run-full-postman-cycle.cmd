@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run-full-postman-cycle.ps1" %*
exit /b %ERRORLEVEL%
