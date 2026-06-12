@echo off
REM ─────────────────────────────────────────────────────────────────────
REM  CMC Print Daemon — All-In-One-Installer für Windows.
REM
REM  Doppelklicken (oder Rechtsklick → "Als Administrator ausführen"):
REM    1. Prüft, ob Python installiert ist (sonst Anweisung zum Download)
REM    2. Installiert das requests-Paket
REM    3. Öffnet den Konfig-Wizard (Backend-URL, Token, Drucker-IP)
REM    4. Aktiviert Auto-Start beim Login (Registry-Eintrag)
REM    5. Startet den Daemon sofort im Hintergrund
REM ─────────────────────────────────────────────────────────────────────

setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   CMC Print Daemon - Einrichtung
echo ============================================================
echo.

REM 1) Python prüfen
where python >nul 2>nul
if errorlevel 1 (
    echo FEHLT: Python ist nicht installiert oder nicht im PATH.
    echo.
    echo Bitte Python 3.10+ installieren:
    echo   https://www.python.org/downloads/windows/
    echo Beim Installieren: "Add python.exe to PATH" anhaken!
    echo.
    pause
    exit /b 1
)

echo [1/4] Python gefunden:
python --version
echo.

REM 2) requests installieren
echo [2/4] Installiere requests-Paket...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet requests
if errorlevel 1 (
    echo FEHLER beim Installieren von 'requests'. Bitte manuell pruefen:
    echo   python -m pip install requests
    pause
    exit /b 1
)
echo      OK
echo.

REM 3) Konfig-Wizard + Auto-Start aktivieren
echo [3/4] Konfig-Wizard wird geoeffnet...
echo      Felder ausfuellen und auf "Speichern und Installieren" klicken.
echo.
python "%~dp0print_daemon.py" --install
if errorlevel 1 (
    echo Setup abgebrochen.
    pause
    exit /b 1
)
echo.

REM 4) Sofort starten (ohne Konsolenfenster — pythonw.exe)
echo [4/4] Daemon wird jetzt im Hintergrund gestartet...
where pythonw >nul 2>nul
if errorlevel 1 (
    start "" /min python "%~dp0print_daemon.py"
) else (
    start "" pythonw "%~dp0print_daemon.py"
)
echo      OK
echo.

echo ============================================================
echo   Fertig!  Der Daemon laeuft jetzt und startet beim naechsten
echo   Windows-Login von selbst.
echo.
echo   Logs:    %%APPDATA%%\CMCPrintDaemon\daemon.log
echo   Status:  in der App unter Einstellungen / Versand
echo.
echo   Erneut konfigurieren:    diese Datei nochmal doppelklicken
echo   Deinstallieren:          python print_daemon.py --uninstall
echo ============================================================
echo.
pause
