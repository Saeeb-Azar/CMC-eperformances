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

### 6.2 Neue Maschine anbinden (Schritt für Schritt)

So bindest du eine **neue** CW1000 (oder einen weiteren Simulator) an:

**Schritt 1 — Maschine in der App anlegen**
Navigation → **Maschinen → „+ Maschine hinzufügen"**:
- **Maschine-ID** = die 4-stellige CIS-ID der Maschine (z. B. `0002`). **Muss exakt der ID entsprechen, die die Maschine in ihren Frames sendet** — sonst wird sie nicht zugeordnet.
- **Name** frei wählbar (z. B. „CW-Linie 2").
- **TCP-Rolle** = **Server (Maschine verbindet sich)** — die Maschine wählt zu uns.
- **TCP-Host/Port** = `0.0.0.0` / `15001` (Standard, unverändert lassen).
- **Pulpo Pick-Location** = `CW` (Präfix), falls sie aus der Pulpo-Queue gefüttert werden soll.
- **Aktive Stationen** (LAB1/LAB2/INV) passend zur Linie.
„Speichern".

**Schritt 2 — Verbindungsadresse (Railway-TCP-Proxy) holen**
Das Backend lauscht intern auf Port **15001**. Von außen erreichbar über den Railway-TCP-Proxy:
Railway → **CMC Backend → Settings → Networking → TCP Proxy** → dort steht eine Adresse wie `metro.proxy.rlwy.net:XXXXX`. Diese (Host **und** Port) brauchst du im nächsten Schritt.

**Schritt 3 — Maschine/Simulator konfigurieren**
Am **CW1000 CIS Simulator** (oder der echten Steuerung):
- Modus auf **„Client"** stellen (die Maschine wählt aktiv raus).
- **IP-Adresse + Port** der Proxy-Adresse eintragen. Da der Simulator nur eine **numerische IP** akzeptiert: in der App unter **Simulator → „Simulator verbinden" → „Auflösen"** die Proxy-Adresse (`…proxy.rlwy.net:XXXXX`) einfügen → du bekommst die IP zum Kopieren (ersetzt das manuelle `nslookup`).
- Auf **„OPEN" / Verbinden** klicken.

**Schritt 4 — Verbindung prüfen**
- Im **Simulator** sollten **HBT (Heartbeat)** und „Simulator verbunden" erscheinen.
- Auf der **Maschinen-Seite** wird die Maschine jetzt **„Online"** angezeigt (Live-Status), die Karten „Online/Verbindungen" zählen hoch.
- Im **Dashboard** taucht die Maschine in der Liste auf (grüner Punkt).

**Schritt 5 — CW-Listen (optional, bei Pulpo)**
Mit gesetzter Pick-Location `CW` füllen sich nach ~30 s die CW-Listen aus der Pulpo-Queue (eine pro Lagerplatz). Voraussetzung: Pulpo-Env-Vars + Webhook sind eingerichtet (siehe §10).

> **Hinweis:** Eine Maschine erscheint erst, wenn sie ihr **erstes Frame** (HBT/ENQ) gesendet hat. „Gestoppt"/„offline" auf der Maschinen-Seite bei vorhandener Verbindung bedeutet i. d. R., dass noch keine Verbindung besteht — Proxy-Adresse/Port und die Maschinen-ID prüfen.

---

### 6.3 Echte Maschine anbinden — direkt zur Cloud (CW1000 CIS)

Während §6.2 den Simulator beschreibt, geht es hier um die **echte CW1000-Steuerung**, die sich **direkt** mit unserem Cloud-Gateway (Railway) verbindet. Bezugspunkt ist der **CIS Connection Manager** der Maschine (das HMI mit der Verbindungsliste „PLC / Incoming BC / Data Manager / CheckWeight / Label BC …").

**Grundprinzip (Rollen & Protokoll)**
- Unsere Software ist der **CIS / „Data Server"** und **lauscht** (Server-Modus) auf TCP-Port **15001**. Die **Maschine ist Client** und wählt zu uns raus.
- Ablauf je Paket: `ENQ` (Barcode gescannt) → unsere Antwort (Auftrag/Label) → `IND → ACK → LAB1/LAB2 → END` (oder `REM`), dazwischen `HBT` (Heartbeat).

**Voraussetzung (Netzwerk-Pfad: direkt zur Cloud)**
Das Maschinennetz braucht **ausgehenden Internet-Zugang** zum Railway-TCP-Proxy. Hinweis: die Proxy-**IP kann sich ändern** und das HMI akzeptiert teils nur **numerische IPs** — vor jedem Go-Live die aktuelle IP neu auflösen (siehe Schritt 2).

**Schritt 1 — Maschine in der App anlegen** (wie §6.2)
- **Maschine-ID** = exakt die ID aus den Frames der Steuerung. Noch unbekannt? Erst Schritt 2–4 verbinden, dann im **Protokoll** das erste `HBT`/`ENQ` ablesen und die ID hier eintragen.
- **TCP-Rolle** = `Server (Maschine verbindet sich)`, **Port** `15001`, **Pulpo Pick-Location** = `CW`, Stationen passend zur Linie.

**Schritt 2 — Cloud-Adresse holen & auflösen**
Railway → **CMC Backend → Settings → Networking → TCP Proxy** → Adresse `xxx.proxy.rlwy.net:PORT`. Da das HMI eine **IP** braucht: in der App unter **Simulator → „Verbinden" → „Auflösen"** die Proxy-Adresse einfügen → **IP + Port** zum Kopieren.

**Schritt 3 — CIS Connection Manager der Maschine einstellen**
1. **Data Origin** auf **`External (Data Server)`** stellen (auf dem Beispiel-Screen bereits gesetzt). Damit holt die Maschine die Auftragsdaten vom externen Server (= uns) statt vom internen Handscanner.
2. In der Zeile, die die **Data-Server-/Auftragsdaten-Verbindung** trägt (höchstwahrscheinlich **„Data Manager"** — mit CMC/Integrator bestätigen, welches Feld die Data-Server-Adresse hält), die **aufgelöste IP : Port** aus Schritt 2 eintragen.
3. **„Reset"** auf dieser Verbindung drücken → sie verbindet neu, Status soll **ACTIVE** (grün) werden.
4. **„Send HeatBeat"** drücken → bei uns muss ein `HBT` ankommen.

**Schritt 4 — Verbindung prüfen**
- Im **Protokoll** erscheinen `HBT`/`ENQ`; auf der **Maschinen-Seite** wird sie **„Online"**.
- Ein Test-Paket scannen → der Verlauf `ENQ → IND → ACK → LAB → END` muss durchlaufen.
- Mit Pick-Location `CW` füllen sich die CW-Listen aus der Pulpo-Queue (eine pro Lagerplatz).

**Schritt 5 — 🔒 Sicherheit**
Der **Test-Modus / Pulpo-Write-Guard bleibt AN**: wir **lesen** aus Pulpo (Queue/CW-Listen), **schreiben nichts** zurück. So lässt sich die echte Maschine voll testen, ohne dass in Pulpo etwas verändert/geschlossen wird. Live-Schreiben erst bewusst in **Einstellungen → Pulpo-Anbindung** freigeben (§10.3).

> **Troubleshooting:** Keine Verbindung → Proxy-IP neu auflösen (kann gewechselt haben), Firewall/Internet-Ausgang des Maschinennetzes prüfen, richtige Zeile (Data Server) erwischt? Maschine bleibt „offline" trotz grüner Zeile am HMI → Maschinen-ID in der App stimmt nicht mit der gesendeten ID überein.

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

> Die **Persistenz ist standardmäßig aktiv**: Aufträge/Ereignisse werden gespeichert (im Test-Modus mit `is_test`-Markierung, in echten Aufträgen ausgeblendet) und nach **30 Tagen automatisch gelöscht** — die Glocke oben zeigt 2 Wochen vorher Hinweise und zählt in der letzten Woche täglich herunter. Eine eigene Historie-Seite ist in Vorbereitung.

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
- Persistenz ist bereits standardmäßig an (`EVENTS_PERSIST_ENABLED=true`); Aufbewahrung über `RETENTION_DAYS` (Default 30).

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
