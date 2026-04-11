@echo off
setlocal
node "%~dp0run-newman.js" mesh-o2c
exit /b %ERRORLEVEL%
