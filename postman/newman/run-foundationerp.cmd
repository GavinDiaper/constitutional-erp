@echo off
setlocal
node "%~dp0run-newman.js" foundation
exit /b %ERRORLEVEL%
