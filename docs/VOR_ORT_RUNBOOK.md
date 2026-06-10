# Vor-Ort-Runbook: echte CW1000 anbinden (Windows-Laptop)

> Ziel: morgen die echte Maschine ans System bringen — mit **Plan A (Cloud-direkt)** und **Plan B (lokales Gateway auf dem Laptop)** als Absicherung, falls die Fabrik-Firewall den Cloud-Weg blockt.
> **Sicherheit:** In jedem Fall bleibt der **Test-Modus / Pulpo-Write-Guard AN** — es wird nichts in Pulpo/DHL geschrieben.

---

## 0. Heute vorbereiten (damit morgen nichts hakt)

Auf dem **Windows-Laptop**, den du mitnimmst:

1. **Python 3.12** installieren (python.org → „Add python.exe to PATH" ankreuzen).
2. Repo holen + Backend vorbereiten (PowerShell):
   ```powershell
   git clone <repo-url> CMC-eperformances
   cd CMC-eperformances\backend
   py -3.12 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
3. **Trockenlauf ohne Cloud** (nur um zu sehen, dass das Gateway startet) — ganz ohne `.env`, nutzt automatisch SQLite:
   ```powershell
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   In der Konsole muss erscheinen: **`CMC Gateway listening on 0.0.0.0:15001`**. (Strg+C zum Stoppen.)
4. **Windows-Firewall** für den Maschinen-Port öffnen (PowerShell **als Administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "CMC Gateway 15001" -Direction Inbound -LocalPort 15001 -Protocol TCP -Action Allow
   ```
5. **`.env`** im `backend\`-Ordner anlegen (Werte aus Railway → CMC Backend → Variables). Nur nötig, wenn du vor Ort auch Supabase/Pulpo lokal nutzen willst:
   ```
   DATABASE_URL=postgresql://...supabase...
   SECRET_KEY=<beliebig-lang-und-zufällig>
   PULPO_BASE_URL=https://eu.pulpo.co
   PULPO_USERNAME=<...>
   PULPO_PASSWORD=<...>
   PULPO_SCOPE=general
   ```
   > Hinweis: `.env` **nie committen** — Zugangsdaten gehören nur auf den Laptop.

---

## 1. Vor Ort — Pre-Flight (entscheidet Plan A vs. B) — 2 Minuten

Laptop **ins selbe Netz wie die Maschine** (gleiches LAN/Subnetz). Railway-Proxy-Adresse testen (Host + Port aus Railway → CMC Backend → Settings → Networking → TCP Proxy):

```powershell
Test-NetConnection <proxy-host>.proxy.rlwy.net -Port <PORT>
```
- **`TcpTestSucceeded : True`** → Cloud erreichbar → **Plan A**.
- **Timeout / False** → Firewall blockt → **Plan B**.

---

## 2. Plan A — Cloud-direkt

1. Proxy-Adresse in eine **IP** auflösen: in der App **Simulator → „Verbinden" → „Auflösen"** (oder `nslookup <proxy-host>` in CMD) → IP + Port notieren.
2. Am **CIS Connection Manager** der Maschine: **Data Origin = External (Data Server)** (bleibt), in der **Data-Server-Zeile** (vermutlich „Data Manager") **IP : Port** eintragen → **Reset** → Status soll **ACTIVE/grün** werden.
3. **Send HeatBeat** drücken.
4. Verifikation: im **Portal (Cloud-Frontend)** → Protokoll zeigt `HBT`, Maschine wird **online**.

---

## 3. Plan B — Lokales Gateway auf dem Laptop (Firewall-sicher)

Die Maschine verbindet zu einer **lokalen IP** statt in die Cloud — kein Outbound-Problem.

1. **LAN-IP des Laptops** ermitteln:
   ```powershell
   ipconfig
   ```
   → die **IPv4-Adresse** des Netzwerk-Adapters notieren, der im selben Netz wie die Maschine ist (z. B. `192.168.1.50`).
2. Backend starten (im `backend\`-Ordner, venv aktiv):
   ```powershell
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   → Konsole: **`CMC Gateway listening on 0.0.0.0:15001`**.
   > Tipp: Geht es nur um „verbindet die Maschine überhaupt?", lass `.env` weg (SQLite) — dann brauchst du vor Ort **kein** Internet (kein Supabase/Pulpo). Connectivity zuerst beweisen, Rest danach.
3. Am **CIS Connection Manager** der Maschine: in der **Data-Server-Zeile** die **Laptop-LAN-IP : 15001** eintragen → **Reset** → **Send HeatBeat**.
4. **Verifikation am schnellsten:** in der **uvicorn-Konsole** müssen `HBT`/`ENQ`-Zeilen + `TCP reply ...` erscheinen.
   - Für die volle UI optional das Frontend lokal starten:
     ```powershell
     cd ..\frontend
     npm install
     npm run dev
     ```
     → Browser `http://localhost:5173` (zeigt die Daten des **lokalen** Backends).

---

## 4. Gemeinsame Verifikation (Plan A oder B)

1. **`HBT`** kommt an → Maschine **online**.
2. **Maschinen-ID** prüfen: muss exakt der ID entsprechen, die die Maschine sendet. Unbekannt? → im Protokoll/Konsole das erste `HBT`/`ENQ` ablesen und in der App unter **Maschinen** eintragen.
3. **Test-Scan**: ein Paket scannen → Verlauf **`ENQ → IND → ACK → LAB → END`** muss durchlaufen.
4. **CW-Listen** (Pick-Location `CW`) füllen sich aus der Pulpo-Queue — nur wenn Supabase/Pulpo lokal/cloud erreichbar ist.

---

## 5. Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Pre-Flight `Test-NetConnection` = False | Firewall blockt Cloud → **Plan B**. |
| Maschinen-Zeile am HMI bleibt **none/rot** | Falsche IP/Port; bei Plan B: Laptop-IP/Subnetz prüfen, Windows-Firewall-Regel (Schritt 0.4) gesetzt? |
| HMI grün, aber Maschine im Portal **offline** | **Maschinen-ID** in der App ≠ gesendete ID. |
| Konsole zeigt kein `CMC Gateway listening` | Port 15001 belegt → anderen Prozess beenden; venv/Install korrekt? |
| Lokales Backend startet, aber DB-Fehler | `DATABASE_URL` (Supabase) nicht erreichbar/falsch → für reinen Connectivity-Test `.env` weglassen (SQLite). |
| Keine CW-Listen | Pulpo-Env fehlt/Outbound-443 blockt → erst Maschinenverbindung beweisen, Pulpo danach. |

---

## 6. Entscheidungs-Spickzettel

```
Pre-Flight Test-NetConnection?
 ├─ True  → Plan A (Cloud-direkt): Proxy-IP in Maschine, Reset, HBT
 └─ False → Plan B (Laptop lokal): uvicorn starten, Laptop-IP:15001 in Maschine, Reset, HBT
Verifikation immer: HBT → online → Test-Scan ENQ→IND→ACK→LAB→END
Sicherheit: Test-Modus bleibt AN — nichts wird in Pulpo/DHL geschrieben.
```
