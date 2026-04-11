@echo off
setlocal
node "%~dp0run-newman.js" mesh-all
exit /b %ERRORLEVEL%
