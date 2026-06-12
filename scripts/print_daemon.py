#!/usr/bin/env python3
"""CMC Print Daemon — LAN-Brücke zwischen Cloud-Backend und Etikettendrucker.

Pollt die offenen Druckaufträge vom CMC-Backend, dekodiert das Label-PDF
(Pulpo liefert PDF) und schickt es als RAW-Bytes an den Drucker (typisch
auf Port 9100 oder 51236, je nach Konfig).

WARUM nicht direkt vom Backend? Das Backend läuft in der Cloud (Railway),
der Drucker hat eine LAN-IP wie 192.168.1.120 — Cloud kann LAN nicht
direkt erreichen. Dieses Skript läuft im LAN und schließt die Lücke.

Nutzung
-------
    pip install requests
    export BACKEND_URL="https://cmc-backend-production-20a9.up.railway.app"
    export BACKEND_TOKEN="<dein Bearer-Token aus localStorage.access_token>"
    export PRINTER_HOST="192.168.1.120"
    export PRINTER_PORT="51236"        # ggf. 9100 für Zebra-Standard
    python print_daemon.py

Konfig (Umgebungsvariablen)
---------------------------
    BACKEND_URL    Basis-URL des CMC-Backends
    BACKEND_TOKEN  Bearer-Token (App-Login → DevTools → localStorage.access_token)
    PRINTER_HOST   IP des Druckers (Default: 192.168.1.120)
    PRINTER_PORT   Port des Druckers (Default: 51236)
    POLL_S         Poll-Intervall in Sekunden (Default: 2)
    LOG_LEVEL      DEBUG / INFO / WARNING / ERROR (Default: INFO)

Logging
-------
Das Script loggt jeden Vorgang strukturiert nach stdout. Fehler werden
ZUSÄTZLICH an das Backend gemeldet (`mark-printed?error=…`), wo sie:
  • im Live-Protokoll als rotes PRINT_FAILED-Event erscheinen
  • in der DHL-Statuskarte als „Letzter Fehler" angezeigt werden
  • in der Druck-Problem-Liste landen (GET /print-queue/problems)
Damit ist jeder Druck-Fehler sofort vom Operator sichtbar — ohne SSH.
"""
from __future__ import annotations

import base64
import logging
import os
import socket
import sys
import time
from datetime import datetime

import requests


BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
PRINTER_HOST = os.environ.get("PRINTER_HOST", "192.168.1.120")
PRINTER_PORT = int(os.environ.get("PRINTER_PORT", "51236"))
POLL_S = float(os.environ.get("POLL_S", "2"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("print_daemon")

if not BACKEND_URL or not BACKEND_TOKEN:
    log.error("BACKEND_URL + BACKEND_TOKEN müssen gesetzt sein.")
    sys.exit(1)

API = f"{BACKEND_URL}/api/v1"
H = {"Authorization": f"Bearer {BACKEND_TOKEN}"}


def send_to_printer(data: bytes) -> str:
    """Roh-Bytes per TCP an den Drucker. Liefert "" bei Erfolg,
    sonst die Fehlermeldung."""
    t0 = time.monotonic()
    try:
        with socket.create_connection((PRINTER_HOST, PRINTER_PORT), timeout=10) as s:
            s.sendall(data)
        dt = (time.monotonic() - t0) * 1000
        log.debug("printer send OK in %.0fms", dt)
        return ""
    except OSError as e:
        dt = (time.monotonic() - t0) * 1000
        msg = f"socket({type(e).__name__}): {e} (nach {dt:.0f}ms)"
        log.error("printer send FAILED: %s", msg)
        return msg


def ack_backend(sid: str, error: str) -> None:
    """Erfolg/Fehler an das Backend rückmelden. Wenn ack selbst fehlschlägt
    → loggen, der Eintrag bleibt in der Queue und wird beim nächsten Poll
    erneut versucht."""
    try:
        r = requests.post(
            f"{API}/print-queue/{sid}/mark-printed",
            headers=H, json={"error": error or None}, timeout=10,
        )
        if r.status_code >= 400:
            log.error("ack %s HTTP %s: %s", sid, r.status_code, r.text[:200])
        else:
            log.debug("ack %s ok (%s)", sid, "error" if error else "printed")
    except requests.RequestException as e:
        log.error("ack %s network error: %s", sid, e)


def poll_once() -> int:
    """Eine Runde: Queue holen, drucken, markieren."""
    try:
        r = requests.get(f"{API}/print-queue", headers=H, timeout=10)
    except requests.RequestException as e:
        log.warning("poll backend unreachable: %s", e)
        return 0
    if r.status_code == 401:
        log.error("poll 401 Unauthorized — BACKEND_TOKEN abgelaufen/falsch?")
        return 0
    if r.status_code >= 400:
        log.error("poll HTTP %s: %s", r.status_code, r.text[:200])
        return 0

    items = r.json() if r.text else []
    if not items:
        log.debug("poll: queue leer")
        return 0
    log.info("poll: %d Druckauftrag/aufträge in der Queue", len(items))

    printed = 0
    for it in items:
        sid = it["id"]
        ref = it.get("reference_id") or "?"
        tracking = it.get("tracking_number") or "?"
        fmt = it.get("label_format") or "?"
        b64 = it.get("label_b64") or ""
        if not b64:
            log.warning("skip %s: kein Label-Inhalt", ref)
            ack_backend(sid, "kein Label-Inhalt im Datensatz")
            continue
        try:
            data = base64.b64decode(b64)
        except Exception as e:
            log.exception("skip %s: ungültiges Base64", ref)
            ack_backend(sid, f"ungültiges Base64: {e}")
            continue

        log.info(
            "print → ref=%s tracking=%s fmt=%s bytes=%d → %s:%d",
            ref, tracking, fmt, len(data), PRINTER_HOST, PRINTER_PORT,
        )
        err = send_to_printer(data)
        ack_backend(sid, err)
        if not err:
            printed += 1
    return printed


def main() -> int:
    log.info(
        "CMC print daemon gestartet | backend=%s | printer=%s:%d | poll=%.1fs",
        BACKEND_URL, PRINTER_HOST, PRINTER_PORT, POLL_S,
    )
    while True:
        try:
            poll_once()
        except KeyboardInterrupt:
            log.info("Beendet (Ctrl+C)")
            return 0
        except Exception as e:
            log.exception("Loop-Iteration crashed: %r", e)
        time.sleep(POLL_S)


if __name__ == "__main__":
    raise SystemExit(main())
