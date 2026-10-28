@echo off
setlocal enabledelayedexpansion
REM ---------------------------------------------------------------
REM  Stops the OpenFAL server (the one start.bat launches).
REM  Use this when the server is running in a window you have lost,
REM  or has been left behind after a crash.
REM ---------------------------------------------------------------
cd /d "%~dp0"

call "%~dp0_port.bat"

echo Looking for OpenFAL on port !APP_PORT! ...

set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:":!APP_PORT! .*LISTENING"') do call :stop_pid %%p

if not defined FOUND (
  echo Nothing is listening on port !APP_PORT! - OpenFAL is not running.
)

REM Only pause when double-clicked, so calling this from a script stays quiet.
echo %CMDCMDLINE% | findstr /i /c:"/c" >nul && pause
endlocal
goto :eof


:stop_pid
REM %1 = pid holding the port. Skips PIDs already handled, since a dual-stack
REM listener shows up once for IPv4 and once for IPv6.
set "PID=%~1"
if "%PID%"=="" goto :eof
if "%PID%"=="0" goto :eof
if defined SEEN_%PID% goto :eof
set "SEEN_%PID%=1"

set "IMG="
for /f "tokens=1" %%i in ('tasklist /fi "PID eq %PID%" /nh 2^>nul') do set "IMG=%%i"
if /i "%IMG%"=="INFO:" goto :eof
if not defined IMG goto :eof
set "FOUND=1"

REM Refuse to kill anything that is not node - another app may hold this port.
if /i not "%IMG%"=="node.exe" (
  echo   Port !APP_PORT! is held by PID %PID% ^(%IMG%^), not node.exe. Leaving it alone.
  goto :eof
)

taskkill /pid %PID% /t /f >nul 2>&1
if errorlevel 1 (
  echo   Could not stop PID %PID%. Try running this as Administrator.
) else (
  echo   Stopped OpenFAL ^(PID %PID%^).
)
goto :eof
