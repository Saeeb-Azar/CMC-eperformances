"""Runtime-Sicherheitsschalter für DHL-Schreibvorgänge.

Analog zum Pulpo-Runtime: ``write_enabled`` ist die einzige Quelle der
Wahrheit, ob echte Versandetiketten bei DHL erzeugt (= bezahlt!) werden.
Default = FALSE → Test-Modus, kein DHL-Call landet. Beim Start aus den
Tenant-Settings nachgeladen, dort persistiert.
"""

from __future__ import annotations

from datetime import datetime


class DhlRuntime:
    def __init__(self) -> None:
        # OFF by default = Test-Modus = kein echtes Label, kein Geld weg.
        self.write_enabled: bool = False
        # Letztes erfolgreich erzeugtes Label (Statuskarte).
        self.last_label_at: datetime | None = None
        self.last_label_tracking: str = ""
        # Letzter Fehler aus dem DHL-API (für die UI).
        self.last_error: str | None = None
        self.last_error_at: datetime | None = None
        # Pre-Creation-Telemetrie für die DHL-Statuskarte: Anzahl
        # Pre-Creates seit Start, davon erfolgreich, plus letzte Nachricht.
        # Bewusst In-Memory — Server-Restart resettet die Zähler, das ist OK.
        self.precreate_total: int = 0
        self.precreate_ok: int = 0
        self.precreate_last_msg: str = ""
        self.precreate_last_at: datetime | None = None
        # Wann hat der Print-Daemon zuletzt die Queue gepollt? So sieht der
        # Operator in der UI sofort, ob der Daemon im LAN überhaupt läuft.
        self.daemon_last_seen: datetime | None = None

    @property
    def test_mode(self) -> bool:
        return not self.write_enabled


dhl_runtime = DhlRuntime()
