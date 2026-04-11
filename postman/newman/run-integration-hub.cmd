@echo off
setlocal
node "%~dp0run-newman.js" integrationhub
exit /b %ERRORLEVEL%
