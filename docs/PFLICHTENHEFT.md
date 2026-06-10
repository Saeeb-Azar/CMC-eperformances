# Pflichtenheft — CMC ePerformances

> Stand: Juni 2026 · Version 0.1
> Das Pflichtenheft beschreibt, **wie** die Anforderungen umgesetzt werden, und hält den **Umsetzungsstand** fest. Legende Status: ✅ umgesetzt · 🟡 teilweise · 🔩 vorbereitet/Stub · ❌ offen.

---

## 1. Zielbestimmung

### 1.1 Musskriterien
- Das System **muss** die TCP-Nachrichten einer CMC CartonWrap CW1000 (CIS rel 4.0) empfangen und protokollkonform beantworten.
- Es **muss** pro Barcode-Scan (ENQ) entscheiden, ob die Maschine das Paket annimmt (`result=1`) oder ablehnt (`result=0`).
- Es **muss** den Paket-Lebenszyklus in Echtzeit im Browser darstellen.
- Es **muss** CW-Listen (erwartete Barcodes) aus dem Pulpo-WMS beziehen und damit Scans filtern.
- Es **muss** einen sicheren **Test-Modus** bieten, in dem **nichts** in Pulpo verändert wird.

### 1.2 Sollkriterien
- Visualisierung von Ablehnungsgründen, Stationsfortschritt, Durchsatz.
- Protokoll-/Log-Bereich für Probleme und erfolgreiche Prozesse.
- Mehrmandanten-Fähigkeit mit Rollen/Rechten.
- Mehrsprachigkeit (DE/EN).

### 1.3 Kannkriterien
- Schreibender Rückfluss an Pulpo (accept→box→label→finish→close) bei erfolgreichem END.
- Persistente Historie (Aufträge + Audit) und Analytics.
- Multi-Maschinen-Übersicht.

### 1.4 Abgrenzung
- Kein Carrier-Etikettendruck im eigenen System (Pulpo/Carrier liefern Label-PDFs).
- Kein lokaler On-Premise-Agent — die Maschine wählt selbst zum Cloud-Backend (TCP-Client).
- Keine Lagerverwaltung — das WMS (Pulpo) bleibt führend.

---

## 2. Produkteinsatz & Zielgruppen

- **Operator** (Bediener an der Linie): überwacht Pakete, sieht Ablehnungen, kann Pakete ausschleusen, Ansicht leeren.
- **Tenant-Admin**: konfiguriert Maschinen, Pulpo-Anbindung, Test-Modus, Benutzer.
- **Super-Admin / Plattform**: verwaltet Mandanten und systemweite Einstellungen.

Einsatzumgebung: Browser (Desktop), Backend in der Cloud (Railway), Maschine/Simulator verbindet sich per TCP über den Railway-Proxy.

---

## 3. Funktionale Anforderungen

| Nr. | Anforderung | Umsetzung | Status |
|---|---|---|---|
| FA-01 | TCP-Verbindungen der Maschine annehmen (Server-Modus, Port 15001) | `gateway/connection.py` `start_server` | ✅ |
| FA-02 | CIS-Nachrichten parsen: ENQ/IND/ACK/INV/LAB1/LAB2/END/REM/HBT/STS | `gateway/parser.py` POSITIONAL_FIELDS | ✅ |
| FA-03 | Protokollkonforme Antworten (Pipe + STX/ETX), latenzkritisch < 2 s | `serialize_response`, synchroner Send im Read-Loop | ✅ |
| FA-04 | ENQ-Routing: NOREAD / Duplicate / Unknown / Single-Reject / Accept | `build_response` (Entscheidungsbaum) | ✅ |
| FA-05 | Doppel-Scan-Schutz (Glitch-Fenster 500 ms) | `is_scan_glitch` | ✅ |
| FA-06 | Order-Reservation bei ENQ (kein Doppel-Versand, inkl. FAILED) | `ActivePackageTracker`, `RESERVATION_GUARD_STATES` | ✅ |
| FA-07 | Sequence-based Ejection bei END (hängende States ausschleusen) | `eject_stale_predecessors` | ✅ |
| FA-08 | Mid-Flight-Eject durch Operator | `mark_for_ejection`, Reject am nächsten Gate | ✅ |
| FA-09 | State-Lifecycle ASSIGNED…COMPLETED/FAILED/EJECTED/DELETED | `orders/service.py` VALID_TRANSITIONS | ✅ |
| FA-10 | Live-Stream ins Frontend (Polling, resumable) | `websocket.py` Ringbuffer + `/events/recent` | ✅ |
| FA-11 | Reject-Visualisierung im UI (Grund pro Paket) | `packageLifecycle.ts`, LiveFlow TableRow | ✅ |
| FA-12 | Multi-Only-Modus pro Maschine | `connection_manager.set_mode` | ✅ |
| FA-13 | CW-Listen aus Pulpo-Packing-Queue (read-only) | `pulpo/cw_sync.py` | ✅ |
| FA-14 | Filter CW-Aufträge (nur CW-Lagerplätze, SACK ausgeschlossen) | Präfix `pulpo_pick_location`, `LIKE 'CW%'` | ✅ |
| FA-15 | Eine CW-Liste pro Lagerplatz (CW1/CW6/CW10…) | `build_cw_lists_by_location` | ✅ |
| FA-16 | Auto-Befüllung per Webhook + periodischem Resync (Self-Heal) | `router.py`, `_cw_sync_loop` | ✅ |
| FA-17 | EANs je Artikel aus Pulpo-Produktdaten | `item.product.barcodes` Extraktion | ✅ |
| FA-18 | Test-Modus: Pulpo nur lesen, Schreiben gesperrt | `runtime.write_enabled`, `_require_writes` | ✅ |
| FA-19 | Test-Modus umschaltbar + persistent | Einstellungen, `tenant.settings` | ✅ |
| FA-20 | CW-Filter über der Aufträge-Tabelle (Optionen aus realen Aufträgen) | LiveFlow „Filter"-Button-Dropdown | ✅ |
| FA-21 | Protokoll: Probleme + erfolgreiche Prozesse, filterbar | `ProtokollPage.tsx` | ✅ |
| FA-22 | Maschinen-Verwaltung (anlegen/bearbeiten, Pulpo-Location) | `MachinesPage` + Modal | ✅ |
| FA-23 | Auth (JWT) + Multi-Tenant + Rollen | `core/security.py`, `permissions.py` | ✅ |
| FA-24 | Pulpo-Webhook-Auth (`?secret=`) | `_authorize_webhook` | ✅ |
| FA-25 | Schreibender Rückfluss an Pulpo bei END (Deferred Writes) | Client-Methoden vorhanden, nicht verdrahtet | 🔩 |
| FA-26 | Persistente Aufträge-/Audit-Historie | Mechanik vorhanden, per Flag aus | 🟡 |
| FA-27 | Manueller Fallback `box_closed` Skip-Logik | Webhook empfangen + geloggt | 🟡 |
| FA-28 | Multi-Maschinen-Übersicht (KPIs über alle) | — | ❌ |
| FA-29 | Multi-Barcode-Split (Semikolon, M-Priorität): M-/CartBox-Code gewinnt, EANs werden ignoriert | `sanitize_barcode()` im ENQ-Pfad | ✅ |

---

## 4. Nichtfunktionale Anforderungen

| Nr. | Anforderung | Umsetzung | Status |
|---|---|---|---|
| NFA-01 | Antwortlatenz Maschine < 2 s | Synchroner TCP-Reply vor allen Side-Effects | ✅ |
| NFA-02 | UI-Aktualisierung ~1 s | Polling 1 Hz | ✅ |
| NFA-03 | Robustheit hinter Cloud-Proxy | HTTP-Polling statt WebSocket | ✅ |
| NFA-04 | Sicherheit: keine ungewollten WMS-Schreibvorgänge | Harter Write-Guard, Default aus | ✅ |
| NFA-05 | Sicherheit: Webhook-Authentifizierung | Shared Secret als Query-Param | ✅ |
| NFA-06 | Mehrsprachigkeit DE/EN | i18next | ✅ |
| NFA-07 | Konsistente UI (Modale/Tabellen) | Gemeinsame `modal.css`/`table.css` | ✅ |
| NFA-08 | Nachvollziehbarkeit (Logs) | Strukturierter JSON-Logger, Protokoll-Seite, Audit (opt-in) | ✅/🟡 |
| NFA-09 | Einfaches Deployment | Railway, Auto-Deploy, Docker | ✅ |
| NFA-10 | Wartbarkeit | Modulare Struktur, Unit-Tests, Doku | ✅ |

---

## 5. Systemarchitektur (Soll = Ist)

Ein Backend-Prozess (FastAPI/asyncio) mit integriertem TCP-Gateway, Postgres-Datenbank, React-Frontend (Polling), Anbindung an Pulpo WMS per HTTPS (OAuth2) und eingehende Webhooks. Details siehe `TECHNISCHE_DOKUMENTATION.md` §3/§6.

---

## 6. Datenmodell (Kern)

- **Tenant** (Mandant), **User** (Rolle, tenant_id), **Machine** (machine_id, TCP-Config, `pulpo_pick_location`, Stationen, Limits).
- **OrderState** (Paket-Lebenszyklus, Maße/Gewicht/Carrier/Tracking) — persistiert bei aktivem Flag.
- **AuditLog** (Event-Historie mit Schweregrad).
- **PulpoPackingOrder** / **PulpoOrderItem** (Cache der Queue + Items/EANs), **PulpoDeferredWrite**, **PulpoSyncState**.
- In-Memory: `connection_manager._cw_lists` (CW-Listen je Maschine), Modi, Pending-Ejections, Ringbuffer.

---

## 7. Schnittstellen

| Schnittstelle | Richtung | Technik |
|---|---|---|
| CMC CW1000 ↔ Backend | bidirektional | TCP 15001, CIS Pipe/STX-ETX |
| Browser ↔ Backend | bidirektional | HTTPS, JSON, Polling/WS/SSE, JWT |
| Backend → Pulpo WMS | ausgehend | HTTPS REST, OAuth2 (read-only im Test-Modus) |
| Pulpo → Backend | eingehend | Webhook POST, `?secret=`-Auth |

---

## 8. Test- & Abnahmekriterien

| Nr. | Kriterium | Status |
|---|---|---|
| AK-01 | Simulator verbindet sich, HBT-Antworten fließen | ✅ |
| AK-02 | ENQ in CW-Liste → akzeptiert; nicht in Liste → abgelehnt | ✅ |
| AK-03 | CW-Liste füllt sich automatisch aus Pulpo-Queue (richtige EANs/Lagerplatz) | ✅ (live verifiziert) |
| AK-04 | Im Test-Modus erzeugt kein Vorgang Schreibzugriffe in Pulpo | ✅ |
| AK-05 | Backend liefert HTTP `200` am Webhook-Endpoint (Secret korrekt) | ✅ |
| AK-06 | Dashboard zeigt Pakete/Stationen/Reject-Gründe live | ✅ |
| AK-07 | Protokoll zeigt Probleme + Erfolge, filterbar | ✅ |
| AK-08 | Backend-Unit-Tests grün | ✅ |

---

## 9. Umsetzungsstand (Zusammenfassung)

- **Vollständig**: Maschinen-Protokoll & Lebenszyklus, Live-UI, CW-Listen aus Pulpo (lesend), Test-Modus, Auth/Tenant, Protokoll (live), Deployment.
- **Teilweise/vorbereitet**: persistente Historie (Flag), schreibender Pulpo-Rückfluss (Deferred Writes), box_closed-Reconcile.
- **Offen**: Multi-Maschinen-KPIs.

---

## 10. Nächste Ausbaustufen (empfohlene Reihenfolge)

1. Persistenz aktivieren + Aufträge-Historie-Seite + Protokoll an DB anbinden.
2. Schreibenden Pulpo-Flow (Deferred Writes bei END) implementieren und kontrolliert scharfschalten.
3. `box_closed`-Skip-Logik (Doppel-Label-Schutz bei manuellem Packen).
4. Multi-Maschinen-Übersicht.
