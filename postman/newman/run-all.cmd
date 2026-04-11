@echo off
setlocal
node "%~dp0run-newman.js" all
exit /b %ERRORLEVEL%
