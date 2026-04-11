@echo off
setlocal
node "%~dp0run-newman.js" mesh
exit /b %ERRORLEVEL%
