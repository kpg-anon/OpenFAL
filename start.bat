@echo off
REM ---------------------------------------------------------------
REM  OpenFAL  ->  http://localhost:5178
REM ---------------------------------------------------------------
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund || goto :err
)

start "" http://localhost:5178
node server.js
goto :eof

:err
echo.
echo npm install failed.
pause
