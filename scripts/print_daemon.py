#!/usr/bin/env python3
"""CMC Print Daemon — LAN-Brücke zwischen Cloud-Backend und Etikettendrucker.

Pollt die offenen Druckaufträge vom CMC-Backend, dekodiert das Label-PDF
(Pulpo liefert PDF) und schickt es als RAW-Bytes an den Drucker auf
Port 51236 (oder 9100 — abhängig von der Drucker-Konfig).

WARUM nicht direkt vom Backend? Das Backend läuft in der Cloud (Railway),
der Drucker hat eine LAN-IP wie 192.168.1.120 — Cloud kann LAN nicht
direkt erreichen. Dieses Skript läuft im LAN und schließt die Lücke.

Nutzung:
    pip install requests
    python print_daemon.py

Konfig (Umgebungsvariablen):
    BACKEND_URL    Basis-URL des CMC-Backends (z.B. https://cmc-backend...up.railway.app)
    BACKEND_TOKEN  Bearer-Token eines Service-Accounts/Operators (aus /login)
    PRINTER_HOST   IP des Druckers (Default: 192.168.1.120)
    PRINTER_PORT   Port des Druckers (Default: 51236)
    POLL_S         Poll-Intervall in Sekunden (Default: 2)

Architektur:
    Cloud-Backend          dieser Daemon            Drucker (LAN)
    ─────────────          ────────────             ─────────────
    /print-queue   ──poll──►  alle 2s
                              dekodiert label_b64
                              TCP RAW write       ──►  192.168.1.120:51236
                              POST mark-printed  ──►  Cloud-Backend
"""
from __future__ import annotations

import base64
import os
import socket
import sys
import time

import requests


BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
PRINTER_HOST = os.environ.get("PRINTER_HOST", "192.168.1.120")
PRINTER_PORT = int(os.environ.get("PRINTER_PORT", "51236"))
POLL_S = float(os.environ.get("POLL_S", "2"))

if not BACKEND_URL or not BACKEND_TOKEN:
    print("ERROR: BACKEND_URL + BACKEND_TOKEN müssen gesetzt sein.", file=sys.stderr)
    sys.exit(1)

API = f"{BACKEND_URL}/api/v1"
H = {"Authorization": f"Bearer {BACKEND_TOKEN}"}


def send_to_printer(data: bytes) -> str:
    """Schickt Roh-Bytes per TCP an den Drucker. Liefert "" bei Erfolg,
    sonst die Fehlermeldung."""
    try:
        with socket.create_connection((PRINTER_HOST, PRINTER_PORT), timeout=10) as s:
            s.sendall(data)
            # Manche Drucker liefern keine Antwort — wir warten nicht.
        return ""
    except OSError as e:
        return f"socket: {e}"


def poll_once() -> int:
    """Eine Runde: Queue holen, drucken, markieren. Liefert Anzahl gedruckter
    Aufträge (oder 0)."""
    try:
        r = requests.get(f"{API}/print-queue", headers=H, timeout=10)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"[poll] backend unreachable: {e}", file=sys.stderr)
        return 0

    items = r.json()
    printed = 0
    for it in items:
        sid = it["id"]
        ref = it["reference_id"]
        tracking = it["tracking_number"]
        b64 = it.get("label_b64") or ""
        if not b64:
            continue
        try:
            data = base64.b64decode(b64)
        except Exception as e:
            print(f"[print] {ref} bad base64: {e}", file=sys.stderr)
            requests.post(f"{API}/print-queue/{sid}/mark-printed",
                          headers=H, json={"error": f"bad base64: {e}"}, timeout=5)
            continue

        print(f"[print] {ref} tracking={tracking} bytes={len(data)} → {PRINTER_HOST}:{PRINTER_PORT}")
        err = send_to_printer(data)
        try:
            requests.post(f"{API}/print-queue/{sid}/mark-printed",
                          headers=H, json={"error": err or None}, timeout=5)
        except requests.RequestException as e:
            print(f"[ack] mark-printed failed for {ref}: {e}", file=sys.stderr)

        if not err:
            printed += 1
        else:
            print(f"[print] FAILED {ref}: {err}", file=sys.stderr)
    return printed


def main() -> int:
    print(f"CMC print daemon → backend={BACKEND_URL}  printer={PRINTER_HOST}:{PRINTER_PORT}  poll={POLL_S}s")
    while True:
        try:
            poll_once()
        except KeyboardInterrupt:
            print("bye")
            return 0
        except Exception as e:  # never let the loop die
            print(f"[loop] iteration crashed: {e!r}", file=sys.stderr)
        time.sleep(POLL_S)


if __name__ == "__main__":
    raise SystemExit(main())
