Na Windowsie (cmd lub PowerShell), z katalogu app\client:

cd C:\Projekty\claude\MyCastle\app\client

rem 1. utwórz venv (osobny od linuksowego .venv)
python -m venv .venv-win

rem 2. aktywuj
.venv-win\Scripts\activate

rem 3. zainstaluj zależności
python -m pip install --upgrade pip
pip install -r requirements.txt

W PowerShell aktywacja to .venv-win\Scripts\Activate.ps1 (jeśli blokuje polityka wykonywania: Set-ExecutionPolicy -Scope Process RemoteSigned).

Albo najprościej — po prostu odpal run_watchtower.bat: przy pierwszym uruchomieniu sam utworzy .venv-win i zainstaluje requirements.txt, więc ręczna instalacja nie jest potrzebna.

Jeśli chcesz zainstalować bez aktywacji venv, jedną komendą:

python -m venv .venv-win && .venv-win\Scripts\python -m pip install -r requirements.txt

Uwagi:
- python musi być w PATH (przy instalacji Pythona zaznacz „Add Python to PATH"). Sprawdź: python --version.
- Jeśli masz kilka wersji, użyj launchera: py -3.14 -m venv .venv-win.
- requirements.txt zawiera m.in. PySide6/pygame/pywin32 — to natywne paczki, dlatego venv linuksowy (.venv) tu nie zadziała i potrzebny jest osobny .venv-win.