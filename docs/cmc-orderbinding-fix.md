# CMC Auftragsbindung — Fix „Versetzte Versandlabel"

## (a) Symptom

Drei Bestellungen mit **demselben EAN** hintereinander durch die Maschine →
die Labels waren **versetzt**: Paket 1 bekam das Label/​die Adresse von Auftrag B,
Paket 2 das von A usw. „Versetzt" (nicht zufällig) war der Hinweis: eine
**Queue-Desynchronisation**, kein Einzelfehler.

## (b) Vorher / Nachher

| Aspekt | Vorher | Nachher (Fix) |
|---|---|---|
| **Bindungs-Zeitpunkt** | IND — async, **nicht awaited** (`_precreate_label` via `create_task`) | **ENQ — synchron, awaited** im Read-Loop, direkt beim Slot-Abbuchen |
| **Reservierungs-Quelle** | flüchtiges In-Memory-Dict `_ref_pulpo_order` | **persistierte aktive `OrderState`** (+ In-Memory nur als Sofort-Schutz) |
| **`FAILED` im Guard** | nein → Doppel-Sendung möglich | **ja** — `FAILED` bleibt reserviert |
| **Überzahl (mehr Scans als Aufträge)** | „defensiver Fallback" bindet `rows[0]` → **falsches Label** | **`None` → ENQ `result=0` (`no_free_order`)** = sauberer Reject |
| **Neustart-Sicherheit** | nein (Map weg) | **ja** (Bindung steht als `OrderState.pulpo_order_id` in der DB) |
| **Precreate / LAB1** | claimten **selbst** (Race) | **lesen nur** (`_bound_order_for_ref`) |

## (c) Die drei Patches (mit Begründung)

Alle in `app/gateway/connection.py`. **Leitprinzip:** *Ein physisches Paket =
eine `reference_id` = eine `pulpo_order_id`.* Slot-Abbuchung und Auftragsbindung
sind **derselbe, in Scan-Reihenfolge ausgeführte Schritt**.

### 1) ENQ — synchron claimen und persistieren
Im Read-Loop, im bestehenden Slot-Block: nach `consume_cw_entry` wird **awaited**
`_claim_pulpo_order` aufgerufen. Treffer → `_bind_order_state` schreibt
`OrderState` (State `ASSIGNED`, `pulpo_order_id`, `barcode`) und committet. Kein
Treffer → `release_cw_for_ref` + `response["result"]=0` /
`rejection_reason="no_free_order"`.
*Warum:* Der Read-Loop ist je Verbindung **sequenziell awaited** → Scan-Reihenfolge
= Bindungs-Reihenfolge. Die Race über das async Precreate-Timing verschwindet.

### 2) `_claim_pulpo_order` — Reservierung aus persistierten States, Fallback raus
Das `reserved`-Set kommt aus **persistierten aktiven `OrderState`** dieser
Maschine (`ASSIGNED/INDUCTED/SCANNED/LABELED/FAILED`), nicht mehr nur aus dem
In-Memory-Dict. Der „defensive Fallback" (`bound_map[ref]=rows[0].id`) ist durch
`return None` ersetzt.
*Warum:* `FAILED` muss reserviert bleiben (sonst Doppel-Sendung), und die Wahrheit
muss einen Neustart überstehen. Ein stiller Falsch-Bind ist schlimmer als ein
sichtbarer Reject.

### 3) `_precreate_label` (und LAB1) — nur noch lesen
`_precreate_label` und `_enrich_lab1_with_dhl` rufen statt `_claim_pulpo_order`
nur noch `_bound_order_for_ref` auf. Ohne Bindung → skip.
*Warum:* Precreate trifft keine Bindungsentscheidung mehr und darf gefahrlos
async/nicht-awaited bleiben. LAB1 findet die Bindung vor und legt nichts Neues an.

**Helfer:** `_tenant_for`, `_bind_order_state` (find-or-create OrderState, idempotent
zum asynchronen `persist_event(ENQ)`), `_bound_order_for_ref`,
`_transfer_binding_on_resume` (Wiederaufnahme erbt die Bindung der noch aktiven ref).

## DRY-RUN-Werkzeug (`POST /api/v1/demo/dry-run-scan`)

Prüft mit **echten Pulpo-Daten**, welcher Auftrag/​welche Adresse/​welches Label
man bei einer Scan-Liste bekäme — **ohne** zu persistieren oder zu versenden.
Drei Riegel: (1) Pulpo-Write-Guard hart auf AUS (Write wirft `PulpoError`),
(2) DHL ersetzt durch den Vorschau-Renderer (`tracking="DRYRUN-####"`),
(3) eine Session, **rollback-only**; zwischen den Scans nur `flush()`, damit der
nächste Scan die Reservierung sieht (FIFO A→B→C).

> Der Dry-Run prüft die **Software-Zuordnung** exakt — **nicht** das physische
> Maschinen-Timing (Eject, Re-Induktion, verlorene Pakete am Band). Der echte
> Beweis gegen „versetzt" bleibt der Maschinenlauf mit dem Fix.

## (d) Anti-Patterns (nie wieder)

- **Korrektheits-relevante Bindungen** gehören **nie** in Fire-and-forget-Tasks
  (`create_task` ohne `await`) — nur Nebeneffekte ohne Entscheidungscharakter.
- Die **Reservierungs-Wahrheit** gehört in **persistenten State**, nicht in ein
  In-Memory-Dict (kein Neustart-Schutz, keine Sicht über Prozessgrenzen).
- Ein **„defensiver Fallback"**, der bei Inkonsistenz *irgendetwas* bindet, ist
  schlimmer als ein sauberes Reject — er macht aus einem sichtbaren einen stillen
  Fehler.
- **Slot-Abbuchung und Auftragsbindung** müssen **derselbe atomare Schritt** sein.
  Zeitliche Entkopplung öffnet das Fenster, in dem die Reihenfolge verrutscht.

## Tests

`app/gateway/tests/test_order_binding.py`:
1. Happy Path gleiche EANs → A,B,C in Scan-Reihenfolge; N+1 → `None`.
3. Überzahl → letzter Scan abgelehnt.
5. FAILED-Guard → FAILED-Auftrag bleibt reserviert.
6. Eject (State `DELETED`) → Auftrag wieder frei.
- DRY-RUN: A,B,C in Reihenfolge, Überzahl → REJECT, **kein** `OrderState` persistiert.
