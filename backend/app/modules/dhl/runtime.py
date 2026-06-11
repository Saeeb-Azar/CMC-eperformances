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

    @property
    def test_mode(self) -> bool:
        return not self.write_enabled


dhl_runtime = DhlRuntime()
