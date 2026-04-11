@echo off
setlocal
node "%~dp0run-newman.js" mesh-h2r
exit /b %ERRORLEVEL%
