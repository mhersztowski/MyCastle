@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Osobny venv od linuksowego .venv — venv jest zalezny od OS
rem (bezwzgledne sciezki w pyvenv.cfg, .venv\Scripts vs .venv/bin).
rem Katalog projektu lezy na dysku Windows wspoldzielonym z WSL.
if not exist .venv-win (
  echo Creating venv...
  python -m venv .venv-win
  .venv-win\Scripts\pip install -r requirements.txt
)

if exist .env.watchtower (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.watchtower") do (
    if not "%%A"=="" set "%%A=%%B"
  )
)

.venv-win\Scripts\python agent.py app:watchtower %*
endlocal
