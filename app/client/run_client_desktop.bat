@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Osobny venv od linuksowego .venv — venv jest zalezny od OS.
if not exist .venv-win (
  echo Creating venv...
  python -m venv .venv-win
  .venv-win\Scripts\pip install -r requirements.txt
)

if exist .env.client-desktop (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.client-desktop") do (
    if not "%%A"=="" set "%%A=%%B"
  )
)

.venv-win\Scripts\python -m apps.client_desktop %*
endlocal
