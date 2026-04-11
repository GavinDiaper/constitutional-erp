@echo off
setlocal
node "%~dp0run-newman.js" processgraph
exit /b %ERRORLEVEL%
