@echo off
setlocal
node "%~dp0run-newman.js" foundation-projects-r2r-reporting
exit /b %ERRORLEVEL%
