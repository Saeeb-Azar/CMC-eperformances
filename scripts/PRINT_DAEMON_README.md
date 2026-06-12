# CMC Print Daemon — All-In-One

Brücke zwischen dem Cloud-Backend und dem Etikettendrucker im LAN. Läuft
unsichtbar im Hintergrund auf einem Windows-PC, startet automatisch beim
Login, kein CMD-Geschäft.

## Was passiert technisch?

```
┌─ Cloud-Backend ──────┐         ┌─ Operator-PC (LAN) ────┐
│                      │         │                         │
│ /api/v1/print-queue  │◄──poll──┤  print_daemon.py        │   ┌─ Drucker ─┐
│                      │         │   (alle 2 s)            │──►│ 192.168…  │
│ /print-queue/{id}/   │◄──ack──┤                         │   │  :51236   │
│   mark-printed       │         │                         │   └───────────┘
└──────────────────────┘         └─────────────────────────┘
```

Der Daemon zieht offene Druckaufträge vom Backend, schickt das Label
per Raw-TCP an den Drucker, meldet Erfolg/Fehler zurück. Alles wird im
App-UI sichtbar (DHL-Statuskarte: „Daemon zuletzt gesehen" + Druck-Stats).

## Installation (einmalig, 2 Minuten)

**Voraussetzung:** Python 3.10+ ist installiert (https://www.python.org/downloads/windows/ — beim Installieren *„Add python.exe to PATH"* anhaken).

1. Den Ordner `scripts/` aus dem Repo auf den Operator-PC kopieren
   (z.B. nach `C:\CMC\`)
2. **`install_print_daemon.bat` doppelklicken**
3. Wizard ausfüllen:
   * **Backend-URL:** vorausgefüllt
   * **Token:** Browser öffnen, App einloggen, **F12 → Console → eingeben:**
     ```js
     localStorage.getItem('access_token')
     ```
     Den langen String (ohne Anführungszeichen) in den Wizard kopieren
   * **Drucker-IP / -Port:** `192.168.1.120` / `51236`
4. „Speichern & Installieren" klicken → Auto-Start ist gesetzt, Daemon
   läuft sofort im Hintergrund

## Wie prüfe ich, ob er läuft?

* **App → Einstellungen → Versand · DHL Parcel DE:**
  „Daemon zuletzt gesehen: vor X Sekunden" → ✅ läuft
* **Auf dem PC:** Task-Manager → `pythonw.exe` muss laufen
* **Log-Datei:** `%APPDATA%\CMCPrintDaemon\daemon.log` (zeigt jeden Druck)

## Token aktualisieren / Drucker ändern

Einfach `install_print_daemon.bat` nochmal doppelklicken → Wizard öffnet
sich erneut, bestehende Werte sind vorausgefüllt.

## Was tun, wenn es nicht druckt?

In der App **Einstellungen → Versand** schauen — drei Fälle:

| Anzeige | Bedeutung | Fix |
|---|---|---|
| „Daemon zuletzt gesehen: nie" | Daemon läuft nicht | Installer erneut starten; Task-Manager prüfen |
| „Daemon zuletzt gesehen: vor X Min." (>1 Min.) | Daemon hängt oder PC offline | PC einschalten / Daemon neu starten (Task-Manager → `pythonw.exe` beenden, dann `install_print_daemon.bat` ausführen) |
| „Druck-Probleme: N" | Daemon konnte nicht drucken | Roter Banner zeigt Klartext-Fehler (z.B. Drucker nicht erreichbar, falscher Port) |

## Deinstallation

```cmd
python scripts\print_daemon.py --uninstall
```
Entfernt den Auto-Start-Eintrag. Konfig + Logs bleiben unter
`%APPDATA%\CMCPrintDaemon\` und können von dort gelöscht werden.

## Dateien

* `print_daemon.py` — der Daemon (Konfig-Wizard + Poll-Loop + Auto-Start)
* `install_print_daemon.bat` — One-Click-Installer für Windows
