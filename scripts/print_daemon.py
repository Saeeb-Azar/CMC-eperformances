#!/usr/bin/env python3
"""CMC Print Daemon — All-In-One LAN-Brücke zum Etikettendrucker.

Aufgaben:
  • Pollt die Cloud-Backend-Druckqueue
  • Schickt Label-Bytes per TCP an den Drucker (192.168.1.120:51236 o.ä.)
  • Meldet Erfolg/Fehler zurück → in App-UI sichtbar
  • Erste Konfig per einmaligem GUI-Wizard (Tkinter, in Python enthalten)
  • Auto-Start beim Windows-Login (Registry HKCU\\Run-Eintrag)
  • Konfig + Logs landen unter %APPDATA%\\CMCPrintDaemon

Modi:
  python print_daemon.py            → läuft mit gespeicherter Konfig
  python print_daemon.py --setup    → GUI-Wizard öffnet sich (auch wenn schon
                                      konfiguriert; aktualisiert)
  python print_daemon.py --install  → wie --setup + Auto-Start aktivieren
  python print_daemon.py --uninstall → Auto-Start entfernen (Konfig bleibt)
  python print_daemon.py --status    → prüft 1× ob alles erreichbar ist

Der Aufrufer (z.B. install_print_daemon.bat) sollte `--install` einmal
durchlaufen lassen; danach läuft der Daemon beim nächsten Login von selbst.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import socket
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("FEHLT: 'requests'-Paket nicht installiert. Bitte ausführen: pip install requests")
    sys.exit(1)

# ── Pfade & Konfig ────────────────────────────────────────────────────────

APP_NAME = "CMCPrintDaemon"
CONFIG_DIR = Path(os.environ.get("APPDATA") or Path.home() / ".config") / APP_NAME
CONFIG_FILE = CONFIG_DIR / "config.json"
LOG_FILE = CONFIG_DIR / "daemon.log"

DEFAULT_CFG = {
    "backend_url": "https://cmc-backend-production-20a9.up.railway.app",
    "backend_token": "",
    "printer_host": "192.168.1.120",
    "printer_port": 51236,
    "poll_seconds": 2.0,
}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return {**DEFAULT_CFG, **json.loads(CONFIG_FILE.read_text(encoding="utf-8"))}
        except Exception:
            pass
    return dict(DEFAULT_CFG)


def save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    logging.info("Konfig gespeichert: %s", CONFIG_FILE)


# ── Setup-Wizard (Tkinter — kommt mit Python) ─────────────────────────────

def setup_wizard(cfg: dict) -> dict | None:
    """Einmaliger GUI-Dialog für Backend + Drucker. Liefert die neue Konfig
    oder None bei Abbruch."""
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        # Fallback: Konsole, falls Tk nicht verfügbar (z.B. minimal-Python)
        print("\n── CMC Print Daemon — Setup (Konsole) ──")
        for key, label in (
            ("backend_url",  "Backend-URL"),
            ("backend_token","Backend-Token (aus Browser-DevTools)"),
            ("printer_host", "Drucker-IP"),
            ("printer_port", "Drucker-Port"),
            ("poll_seconds", "Poll-Intervall (Sekunden)"),
        ):
            cur = cfg.get(key, "")
            v = input(f"{label} [{cur}]: ").strip()
            if v:
                cfg[key] = int(v) if key == "printer_port" else (
                    float(v) if key == "poll_seconds" else v
                )
        return cfg

    result: dict | None = None

    root = tk.Tk()
    root.title("CMC Print Daemon — Einrichtung")
    root.geometry("520x360")
    root.resizable(False, False)

    frm = ttk.Frame(root, padding=18)
    frm.pack(fill="both", expand=True)

    ttk.Label(frm, text="CMC Print Daemon", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(
        frm, foreground="#555",
        text="Schickt Versand-Etiketten vom Backend an den Etikettendrucker.\n"
             "Konfig wird gespeichert und beim Windows-Start automatisch geladen.",
    ).pack(anchor="w", pady=(0, 12))

    entries: dict[str, tk.Entry] = {}
    fields = [
        ("backend_url",  "Backend-URL"),
        ("backend_token","Token (Browser: F12 → Console → localStorage.getItem('access_token'))"),
        ("printer_host", "Drucker-IP"),
        ("printer_port", "Drucker-Port"),
        ("poll_seconds", "Poll-Intervall (Sek.)"),
    ]
    for key, label in fields:
        row = ttk.Frame(frm); row.pack(fill="x", pady=3)
        ttk.Label(row, text=label, width=22).pack(side="left")
        e = ttk.Entry(row, width=44, show=("*" if key == "backend_token" else None))
        e.insert(0, str(cfg.get(key, "")))
        e.pack(side="left", fill="x", expand=True)
        entries[key] = e

    def on_ok():
        nonlocal result
        out = dict(cfg)
        for k in entries:
            v = entries[k].get().strip()
            if not v:
                messagebox.showerror("Fehlt", f"Feld leer: {k}")
                return
            try:
                if k == "printer_port": v = int(v)
                elif k == "poll_seconds": v = float(v)
            except ValueError:
                messagebox.showerror("Ungültig", f"{k} muss eine Zahl sein.")
                return
            out[k] = v
        result = out
        root.destroy()

    btnrow = ttk.Frame(frm); btnrow.pack(fill="x", pady=(18, 0))
    ttk.Button(btnrow, text="Abbrechen", command=root.destroy).pack(side="right", padx=4)
    ttk.Button(btnrow, text="Speichern & Installieren", command=on_ok).pack(side="right")

    root.mainloop()
    return result


# ── Auto-Start (Windows Registry) ─────────────────────────────────────────

def windows_autostart_enable() -> bool:
    """Eintrag in HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run.
    Beim Login wird der Daemon dann ohne Konsolenfenster gestartet
    (pythonw.exe)."""
    if os.name != "nt":
        return False
    try:
        import winreg  # type: ignore
        script = str(Path(__file__).resolve())
        # pythonw.exe = ohne sichtbares Konsolenfenster
        pyw = Path(sys.executable).with_name("pythonw.exe")
        if not pyw.exists():
            pyw = Path(sys.executable)  # Fallback: python.exe (zeigt Fenster)
        cmd = f'"{pyw}" "{script}"'
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
        winreg.CloseKey(key)
        logging.info("Auto-Start aktiviert: %s", cmd)
        return True
    except Exception as e:
        logging.warning("Auto-Start setzen fehlgeschlagen: %s", e)
        return False


def windows_autostart_disable() -> None:
    if os.name != "nt":
        return
    try:
        import winreg  # type: ignore
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE,
        )
        winreg.DeleteValue(key, APP_NAME)
        winreg.CloseKey(key)
        logging.info("Auto-Start deaktiviert")
    except FileNotFoundError:
        pass
    except Exception as e:
        logging.warning("Auto-Start entfernen fehlgeschlagen: %s", e)


# ── Druck-Loop ────────────────────────────────────────────────────────────

def send_to_printer(host: str, port: int, data: bytes) -> str:
    t0 = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=10) as s:
            s.sendall(data)
        return ""
    except OSError as e:
        return f"socket({type(e).__name__}): {e} (nach {(time.monotonic()-t0)*1000:.0f}ms)"


def run_loop(cfg: dict) -> int:
    api = cfg["backend_url"].rstrip("/") + "/api/v1"
    h = {"Authorization": f"Bearer {cfg['backend_token']}"}
    host, port = cfg["printer_host"], int(cfg["printer_port"])
    poll = float(cfg["poll_seconds"])
    logging.info(
        "Daemon läuft | backend=%s | drucker=%s:%d | poll=%.1fs | log=%s",
        cfg["backend_url"], host, port, poll, LOG_FILE,
    )
    last_warned_unreachable = False
    while True:
        try:
            r = requests.get(f"{api}/print-queue", headers=h, timeout=10)
            if r.status_code == 401:
                if not last_warned_unreachable:
                    logging.error("401 Unauthorized — Token abgelaufen. --setup ausführen.")
                    last_warned_unreachable = True
                time.sleep(poll); continue
            if r.status_code >= 400:
                logging.error("Backend HTTP %s: %s", r.status_code, r.text[:200])
                time.sleep(poll); continue
            last_warned_unreachable = False
            items = r.json() or []
            for it in items:
                sid = it["id"]
                ref = it.get("reference_id") or "?"
                tracking = it.get("tracking_number") or "?"
                b64 = it.get("label_b64") or ""
                if not b64:
                    requests.post(f"{api}/print-queue/{sid}/mark-printed",
                                  headers=h, json={"error": "leeres Label"}, timeout=10)
                    continue
                try:
                    data = base64.b64decode(b64)
                except Exception as e:
                    requests.post(f"{api}/print-queue/{sid}/mark-printed",
                                  headers=h, json={"error": f"base64: {e}"}, timeout=10)
                    continue
                logging.info("print → ref=%s tracking=%s bytes=%d", ref, tracking, len(data))
                err = send_to_printer(host, port, data)
                try:
                    requests.post(f"{api}/print-queue/{sid}/mark-printed",
                                  headers=h, json={"error": err or None}, timeout=10)
                except requests.RequestException as e:
                    logging.error("mark-printed Netzwerkfehler: %s", e)
                if err:
                    logging.error("Druckfehler ref=%s: %s", ref, err)
        except requests.RequestException as e:
            if not last_warned_unreachable:
                logging.warning("Backend nicht erreichbar: %s", e)
                last_warned_unreachable = True
        except KeyboardInterrupt:
            logging.info("Beendet (Ctrl+C)")
            return 0
        except Exception:
            logging.exception("Loop crashed")
        time.sleep(poll)


def quick_status(cfg: dict) -> int:
    """1× alles checken — fürs Skript-Debugging."""
    print(f"Konfig: {CONFIG_FILE}")
    print(f"  backend  = {cfg['backend_url']}")
    print(f"  token    = {'gesetzt' if cfg['backend_token'] else 'LEER'}")
    print(f"  printer  = {cfg['printer_host']}:{cfg['printer_port']}")
    api = cfg["backend_url"].rstrip("/") + "/api/v1"
    h = {"Authorization": f"Bearer {cfg['backend_token']}"}
    try:
        r = requests.get(f"{api}/print-queue", headers=h, timeout=10)
        print(f"Backend: HTTP {r.status_code}")
        if r.status_code == 200:
            print(f"  offene Aufträge: {len(r.json())}")
    except Exception as e:
        print(f"Backend FEHLER: {e}")
    try:
        with socket.create_connection((cfg["printer_host"], int(cfg["printer_port"])), timeout=3):
            print("Drucker: erreichbar")
    except Exception as e:
        print(f"Drucker FEHLER: {e}")
    return 0


# ── Main ──────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=APP_NAME)
    ap.add_argument("--setup", action="store_true", help="Konfig-Dialog öffnen")
    ap.add_argument("--install", action="store_true", help="Konfig-Dialog + Auto-Start aktivieren")
    ap.add_argument("--uninstall", action="store_true", help="Auto-Start entfernen")
    ap.add_argument("--status", action="store_true", help="Konfig + Erreichbarkeit prüfen")
    args = ap.parse_args()

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

    if args.uninstall:
        windows_autostart_disable()
        print("Auto-Start entfernt. Konfig bleibt erhalten.")
        return 0

    cfg = load_config()

    if args.setup or args.install or not cfg.get("backend_token"):
        # Setup nötig (entweder explizit oder weil noch kein Token da ist)
        new = setup_wizard(cfg)
        if new is None:
            print("Abgebrochen.")
            return 1
        save_config(new)
        cfg = new
        if args.install:
            if windows_autostart_enable():
                print("✓ Konfig gespeichert. Auto-Start aktiviert. Daemon startet nun.")
            else:
                print("✓ Konfig gespeichert. Auto-Start NICHT aktiv (nur Windows).")

    if args.status:
        return quick_status(cfg)

    return run_loop(cfg)


if __name__ == "__main__":
    raise SystemExit(main())
