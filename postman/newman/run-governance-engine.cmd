@echo off
setlocal
node "%~dp0run-newman.js" governance
exit /b %ERRORLEVEL%
