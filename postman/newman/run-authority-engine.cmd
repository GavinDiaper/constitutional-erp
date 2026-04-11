@echo off
setlocal
node "%~dp0run-newman.js" authority
exit /b %ERRORLEVEL%
