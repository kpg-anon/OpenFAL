@echo off
REM ---------------------------------------------------------------
REM  Sets APP_PORT for start.bat / stop.bat, resolving it exactly
REM  the way server.js does: PORT from the environment, then .env,
REM  then the 5178 default.
REM
REM  Called with `call`, so it deliberately does not setlocal -
REM  APP_PORT has to survive back into the caller.
REM ---------------------------------------------------------------

set "APP_PORT="
if defined PORT set "APP_PORT=%PORT%"

if not defined APP_PORT if exist "%~dp0.env" (
  REM /c: is required - without it findstr splits the pattern on spaces and
  REM treats "^" as a pattern of its own, which matches every line in the
  REM file and would pick up FAL_KEY.
  for /f "usebackq tokens=2 delims==" %%a in (`findstr /r /i /c:"^ *PORT *=" "%~dp0.env" 2^>nul`) do set "APP_PORT=%%a"
)

if not defined APP_PORT set "APP_PORT=5178"

REM .env values may be quoted or padded; server.js strips both, so match it
set APP_PORT=%APP_PORT:"=%
for /f "tokens=* delims= " %%a in ("%APP_PORT%") do set "APP_PORT=%%a"

REM Anything that is not a plain number means the parse went wrong. Fall back to
REM the default rather than acting on - or printing - whatever was picked up:
REM .env holds the API key, and it must never reach the console.
echo %APP_PORT%| findstr /r /c:"^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo Could not read a valid PORT from .env - using the 5178 default.
  set "APP_PORT=5178"
)

goto :eof
