@echo off
setlocal
node "%~dp0run-newman.js" navigatorai
exit /b %ERRORLEVEL%
