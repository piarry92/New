@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% --version >nul 2>nul || (echo Python fehlt. Bitte von https://www.python.org/downloads/ installieren und dabei "Add python.exe to PATH" anhaken. & pause & exit /b)
%PY% -c "import anthropic" >nul 2>nul || (echo Einmalig: KI-Paket fuer die Auswertung der SV-Berichte wird installiert ... & %PY% -m pip install --quiet --disable-pip-version-check anthropic)
%PY% app.py --browser %*
pause
