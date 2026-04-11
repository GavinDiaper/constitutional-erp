@echo off
setlocal
node "%~dp0run-newman.js" eventprocessor
exit /b %ERRORLEVEL%
