# Anwenderhandbuch — CMC ePerformances

> Stand: Juni 2026 · Version 0.1
> Ausführliche Bedienungsanleitung für Operatoren und Administratoren.

---

## 1. Einleitung

CMC ePerformances ist das Dashboard zur Überwachung und Steuerung der **CMC CartonWrap CW1000** Verpackungslinie, angebunden an das **Pulpo WMS**. Du siehst in Echtzeit, welche Pakete die Maschine bearbeitet, in welchem Schritt sie sich befinden, und steuerst, welche Aufträge angenommen werden.

**Zielgruppen:**
- **Operator** — überwacht die Linie, reagiert auf Probleme.
- **Administrator** — konfiguriert Maschinen, die Pulpo-Anbindung und Benutzer.

**Zugang:** Browser → eure Frontend-URL (z. B. `https://cmc-frontend-production.up.railway.app`). Empfohlen: Chrome/Edge/Firefox aktuell.

---

## 2. Anmeldung

1. Frontend-URL öffnen → Login-Seite.
2. E-Mail + Passwort eingeben (Standard-Test: `admin@eperformances.de` / `admin123` — produktiv ändern!).
3. „Anmelden". Bei falschen Daten erscheint eine Fehlermeldung.
4. Oben rechts: Sprache **DE/EN** umschaltbar; abmelden über die Seitenleiste unten.

---

## 3. Navigation (Seitenleiste)

| Punkt | Inhalt |
|---|---|
| **Dashboard** | Live-Ansicht der Maschine: Aufträge, Stationen, CW-Listen |
| **Maschinen** | Maschinen anlegen/bearbeiten (inkl. Pulpo Pick-Location) |
| **Simulator** | Testverbindung zum CW1000-Simulator + IP-Helfer |
| **Protokoll** | Ereignis-Log: Probleme + erfolgreiche Prozesse |
| **Einstellungen** | Firmenprofil, **Pulpo-Anbindung / Test-Modus** |

Oben ein Banner: **„TEST-MODUS — Pulpo wird nur gelesen, keine Schreibvorgänge"** (blau) bzw. **„● LIVE — Schreibvorgänge an Pulpo aktiv"** (orange).

---

## 4. Dashboard (Live-Ansicht)

### 4.1 Aufbau
- **Oben**: Maschinen-Status (Aktiv/Verbunden), „Live-Stream aktiv".
- **Links**: Maschinen-Liste + **CW-LISTEN**.
- **Mitte**: Stat-Karten (In Bearbeitung / Wartend / Problem / Fertig) mit Trendlinie, darunter die **Aufträge-Tabelle**.
- **Rechts** (wenn ein Auftrag gewählt): **Bestellung im Fokus** mit Stationsfortschritt + Verlauf.

### 4.2 Maschine wählen
Links die Maschine anklicken (z. B. `CW0001`). Erscheint sie nicht, ist sie nicht verbunden — siehe Simulator/Maschinen.

### 4.3 Aufträge-Tabelle
Eine Zeile je Paket: Position, **Ref/Barcode** (zweizeilig, mit Typ S/M), Status (farbiger Punkt), aktuelle Station, „Seit", Maße, Gewicht, Aktion. Problem-Zeilen sind rot markiert mit Ablehnungsgrund.

- **Suche**: Feld oben rechts (Ref oder Barcode).
- **CW-Filter**: Button **„Filter"** oben rechts → Dropdown mit **„Alle CW-Listen"** und den CWs, **die gerade als Auftrag vorkommen**. Auswahl filtert die Tabelle; aktiver Filter wird am Button + im Header („gefiltert: CW10 · zurücksetzen") angezeigt.
- **Leeren**: Button „Leeren" leert die Live-Ansicht (Backend-Historie bleibt, falls Persistenz an).

### 4.4 Bestellung im Fokus (rechtes Panel)
Klick auf eine Zeile öffnet rechts: Bestelldaten (Maschine, Barcode/ID, Maße, Gewicht), **aktuelle Station** mit Punkte-Fortschritt (Scanner→ENQ→3D→Verpacker→Etikettierer→Ausgang), **Verlauf (Messages)** und ggf. Aktionen (Resolve/Retry/Soft-Delete).

### 4.5 Paket ausschleusen (Eject)
In der Aktion-Spalte „Eject" → das Paket wird beim nächsten Gate (ACK/INV/LAB/END) von der Maschine ausgeworfen; das Band läuft weiter. „Vorgemerkt" lässt sich zurücknehmen, solange das Gate noch nicht erreicht ist.

---

## 5. CW-Listen verstehen (wichtig)

CW-Listen bestimmen, **welche Barcodes die Maschine annimmt**. Sie kommen **automatisch aus der Pulpo-Packing-Queue** — eine Liste **pro Lagerplatz** (z. B. CW6, CW7, CW10), mit den erwarteten Barcodes + Mengen. Sie sind **read-only** (Badge „PULPO"), du tippst nichts ein.

In der Sidebar hat jede CW-Liste:
- **☑ Aktiv-Checkbox** — schaltet die Liste **am Scanner scharf**: Ist sie aktiv, werden **nur** Barcodes dieser Liste angenommen, alles andere wird abgelehnt (`UNKNOWN`). Beeinflusst die **Maschine**.
- **Klick auf den Namen** öffnet die Detailliste (alle Barcodes + verbraucht/erwartet).

Den **Anzeige-Filter** (welche Aufträge die Tabelle zeigt) steuerst du über den **„Filter"-Button** über der Tabelle — das beeinflusst nur deine Sicht, nicht die Maschine.

> Merksatz: **Checkbox = scharf schalten (Maschine)**, **Filter-Button = Ansicht filtern**.

Die Queue dreht sich schnell — CW-Listen erscheinen und verschwinden, je nachdem, ob gerade ein Auftrag dieses Lagerplatzes in der Warteschlange liegt.

---

## 6. Maschinen verwalten

**Navigation → Maschinen.** Übersicht mit Stat-Karten (gesamt/online/Warnungen/Verbindungen) und Tabelle (Status, Sequenz, Heartbeat, Max. Abmessungen, Stationen, **Pulpo-Location**, Bearbeiten).

### 6.1 Maschine anlegen/bearbeiten
„+ Maschine hinzufügen" bzw. ✏️. Im Dialog (Karten-Sektionen):
- **Basisdaten**: Maschine-ID (4-stellig, wie im Simulator, z. B. `0001`), Name, Modell, TCP-Rolle.
- **Netzwerk**: TCP-Host/Port (Standard `0.0.0.0:15001`).
- **Pulpo Integration**: **Pulpo Pick-Location** = Lagerplatz-Präfix. **`CW`** matcht CW1/CW6/CW10 und schließt SACK/Pack aus. Leer = ganze Queue.
- **Max. Abmessungen** + **Aktive Stationen** (LAB1/LAB2/INV).
„Speichern".

> Für die Pulpo-CW-Listen: Pick-Location auf **`CW`** setzen (nur die zwei Buchstaben).

---

## 7. Simulator-Seite

Zum Testen ohne echte Maschine.
- **Stat-Karten** (Ereignisse/ENQ/END/HBT) + **Verbindungs-Karte**.
- **Live Event-Feed** (filterbar nach Typ, durchsuchbar, aufklappbare Details).
- **Verbundene Maschinen** + „Maschine verwalten".
- **Paket-Verlauf** als Donut.

### 7.1 Simulator verbinden (Railway)
Der CW1000-Simulator (Windows) verbindet sich als **Client** an die Railway-TCP-Proxy-Adresse. Der Simulator braucht eine **IP** — im Bereich „Simulator verbinden" gibt es einen **„Auflösen"-Helfer**: Railway-Proxy-Adresse (`xxx.proxy.rlwy.net:PORT`) einfügen → IP zum Kopieren. Modus „Client", IP + Port eintragen, „OPEN".

---

## 8. Einstellungen — Pulpo-Anbindung & Test-Modus

**Navigation → Einstellungen.**
- **Firmenprofil**: Name, Slug, E-Mail.
- **Pulpo-Anbindung**: Status (verbunden, **Test-Modus/Live**), Stats (letzte Synchronisierung, Barcodes, offene Bestellungen) und der **Test-Modus-Schalter**.
- **Schnellzugriff**: Maschinen / CW-Listen / Pulpo / Benutzer.
- **Abonnement** + Mitglied-seit.

### 8.1 Test-Modus
- **AN (Standard)**: Pulpo-Daten werden **nur gelesen** (CW-Listen). Du kannst Bestellungen abarbeiten/testen — **nichts** wird in Pulpo geändert/geschlossen/gelöscht.
- **AUS (Live)**: schreibende Rückmeldungen an Pulpo werden möglich. **Nur bewusst und nach Freigabe umschalten.**

---

## 9. Protokoll (Log-Bereich)

**Navigation → Protokoll.** Nachvollziehbares Ereignis-Log:
- **Zähler-Karten**: **Problem** (rot), **Erfolg** (grün), **Info** — klickbar als Filter.
- **Filter-Chips** (Alle/Problem/Erfolg/Info) + **Suche**.
- **Tabelle**: Zeit, Typ, Kategorie (farbig), Nachricht (+ Referenz + Ablehnungsgrund), Maschine. Zeile aufklappen → Roh-Daten/JSON.
- **Probleme** = Ablehnungen (NOREAD/UNKNOWN/Duplicate…), Auswürfe (EJECT), Fehler. **Erfolg** = abgeschlossene Prozesse. Heartbeats sind ausgeblendet.

> Aktuell ist es ein **Live-Session-Log** (im Speicher). Für ein **dauerhaftes** Protokoll mit Historie muss die Persistenz aktiviert werden (Admin/Go-Live).

---

## 10. Administration & Inbetriebnahme (für Admins)

### 10.1 Pulpo verbinden
Auf dem Backend (Railway → CMC Backend → Variables) setzen:
```
PULPO_USERNAME = <Pulpo-Benutzer>
PULPO_PASSWORD = <Pulpo-Passwort>
PULPO_SCOPE    = general
PULPO_WEBHOOK_SECRET = <selbst vergebener Wert>
```
Dann in **Maschinen** die Pick-Location der CW1000 auf **`CW`** setzen.

### 10.2 Pulpo-Webhook einrichten (in Pulpo)
Pulpo → Webhooks → neu:
- **Lager**: Standard
- **Typ**: `packing_order_created` + `packing_order_finished`
- **Method**: POST
- **URL**: `https://<dein-backend>/api/v1/webhooks/pulpo?secret=<derselbe Secret-Wert>`
- **Zugangsdaten**: Keine

Bestehende Webhooks (zu anderen Systemen) **nicht** anfassen. In **WEBHOOKLOGS** sollte bei deiner URL `Code 200` stehen.

### 10.3 Go-Live (aus dem Test-Modus)
- Erst wenn der schreibende Pulpo-Flow gebaut/getestet ist, in **Einstellungen → Pulpo-Anbindung** den **Test-Modus ausschalten**.
- Für dauerhafte Protokolle: `EVENTS_PERSIST_ENABLED=true` auf dem Backend.

---

## 11. Troubleshooting / FAQ

| Symptom | Ursache / Lösung |
|---|---|
| „Backend getrennt" / 502 | Backend antwortet nicht. `PORT`-Variable nicht auf 5432 setzen; Railway-Deploy/Logs prüfen. Backend-URL muss `{"name":"CMC ePerformances",…}` liefern. |
| Dashboard zeigt keine Maschine | Simulator/Maschine nicht verbunden, oder noch keine erste Nachricht (HBT/ENQ) gesendet. |
| CW-Liste bleibt leer (0/0) | Pick-Location prüfen (exakt `CW`); liegt gerade ein CW-Auftrag in der Pulpo-Queue? Queue dreht schnell. |
| CW-Liste zeigt SACK/falsche Aufträge | Pick-Location-Präfix korrigieren (`CW`). |
| Webhook `401` | `?secret=` in der Pulpo-URL ≠ `PULPO_WEBHOOK_SECRET`; Redeploy abwarten. |
| M-Code wird trotz nicht-Listung angenommen | Die zugehörige CW-Liste muss **aktiv** (Checkbox) und der Barcode darf nicht (z. B. durch Timing) gerade gematcht sein. |
| Ansicht voller alter Pakete | „Leeren" klicken (setzt auch den Doppel-Scan-Tracker zurück). |
| Konsolen-Fehler „disconnected port / Autoscroll" | Browser-Extension, nicht die App — ignorierbar. |

---

## 12. Glossar

- **ENQ/IND/ACK/LAB/END/REM/HBT/STS** — CIS-Protokoll-Nachrichten der Maschine (Scan, Induktion, 3D-Vermessung, Etikett, Ausgang, Entfernen, Heartbeat, Status).
- **CW-Liste** — Liste erwarteter Barcodes pro Lagerplatz, kommt aus Pulpo.
- **Lagerplatz** — Pulpo-Code (CW10 = CartonWrap, SACK = Sack-Packen).
- **Test-Modus** — sicherer Modus: aus Pulpo lesen, nichts schreiben.
- **Multi-Only** — Modus, in dem numerische (Single-)Barcodes abgelehnt werden.
- **Eject** — kontrolliertes Ausschleusen eines Pakets.
