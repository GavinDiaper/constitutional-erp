@echo off
setlocal
node "%~dp0run-newman.js" mesh-p2p
exit /b %ERRORLEVEL%
