@echo off
REM ---------------------------------------------------------------
REM  OpenFAL  ->  http://localhost:5178
REM
REM  Starts the server detached, with no console window, so nothing
REM  has to stay open to keep it up. Use stop.bat to shut it down.
REM
REM    start.bat            background, no window (default)
REM    start.bat -c         stay in this window (for debugging)
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
call "%~dp0_port.bat"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund || goto :err
)

REM Who has the port? node.exe means OpenFAL is already up; anything else is a
REM clash worth reporting rather than starting a copy that cannot bind.
set "HOLDER="
set "HOLDER_IMG="
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do call :probe %%p

if not defined HOLDER goto :free
if /i "%HOLDER_IMG%"=="node.exe" goto :already

echo.
echo Port %APP_PORT% is held by PID %HOLDER% (%HOLDER_IMG%), which is not OpenFAL.
echo Stop that program, or set a different PORT in .env.
echo.
pause
goto :eof

:already
echo OpenFAL is already running on port %APP_PORT% (PID %HOLDER%).
start "" http://localhost:%APP_PORT%
goto :eof

:free
if /i "%~1"=="-c" goto :console
if /i "%~1"=="--console" goto :console

echo Starting OpenFAL on port %APP_PORT% ...

REM Start-Process detaches the child, so it outlives this window. Both streams
REM are redirected because a hidden process has no console to print to.
REM Note: this truncates the previous run's logs.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%CD%\.srv.log' -RedirectStandardError '%CD%\.srv.err'; $up = $false; foreach ($i in 1..40) { if (Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }; Start-Sleep -Milliseconds 250 }; if (-not $up) { exit 1 }"

if errorlevel 1 (
  echo.
  echo The server did not come up. Last lines of .srv.err:
  echo.
  if exist ".srv.err" powershell -NoProfile -Command "Get-Content '.srv.err' -Tail 15"
  echo.
  pause
  goto :eof
)

start "" http://localhost:%APP_PORT%
echo.
echo   OpenFAL is running in the background on port %APP_PORT%.
echo   You can close this window - the server keeps running.
echo.
echo     logs  .srv.log  /  .srv.err
echo     stop  stop.bat
echo.
goto :eof

:console
echo Running in this window - closing it stops the server.
node server.js
goto :eof

:probe
REM %1 = pid holding the port; records the first real one found. A dual-stack
REM listener shows up twice, once for IPv4 and once for IPv6.
if defined HOLDER goto :eof
if "%~1"=="" goto :eof
if "%~1"=="0" goto :eof
for /f "tokens=1" %%i in ('tasklist /fi "PID eq %~1" /nh 2^>nul') do set "HOLDER_IMG=%%i"
if /i "%HOLDER_IMG%"=="INFO:" set "HOLDER_IMG="
if not defined HOLDER_IMG goto :eof
set "HOLDER=%~1"
goto :eof

:err
echo.
echo npm install failed.
pause
