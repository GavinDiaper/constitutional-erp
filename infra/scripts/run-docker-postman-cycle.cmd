@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run-docker-postman-cycle.ps1" %*
exit /b %ERRORLEVEL%