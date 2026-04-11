@echo off
setlocal
node "%~dp0run-newman.js" mesh-r2r
exit /b %ERRORLEVEL%
