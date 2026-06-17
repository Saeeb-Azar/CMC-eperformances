"""Runtime safety switch for Pulpo writes.

`write_enabled` is the single source of truth for whether the PulpoClient is
allowed to perform WRITE operations (accept/box/label/finish/close). It
defaults to FALSE — "Test-Modus" — so that:

  * reading from Pulpo (CW-Listen, queue) always works, but
  * nothing is ever changed/closed/deleted in Pulpo unless an admin
    explicitly turns writes on in the settings.

Because the default is the safe one, a fresh process start is always in
Test-Modus until the persisted setting is loaded. The flag is mirrored into
the tenant settings (DB) so the choice survives restarts.
"""

from __future__ import annotations

from datetime import datetime


class PulpoRuntime:
    def __init__(self) -> None:
        # ── ZWEI UNABHÄNGIGE Schalter ──────────────────────────────────────
        # test_mode: Sandbox/Test-Aufträge. Markiert OrderStates als is_test
        #   (Test- vs. Produktiv-Ansicht), steuert Demo & LAB1-Cache-Skip.
        #   True = Sandbox.
        self.test_mode: bool = True
        # write_enabled: „Pulpo automatisch zurückschreiben" (deferred Replay:
        #   accept/box/label/finish/close). Bewusst GETRENNT vom test_mode, damit
        #   man im Echtbetrieb (test_mode=False, echte Labels) das Pulpo-
        #   Rückschreiben noch AUS lassen und manuell in Pulpo arbeiten kann —
        #   und erst per Klick scharf schaltet. Echtes Schreiben passiert NUR,
        #   wenn write_enabled=True UND test_mode=False (siehe replay.py).
        self.write_enabled: bool = False
        # Last successful resync (for the settings status card).
        self.last_sync_at: datetime | None = None
        self.last_sync_orders: int = 0
        self.last_sync_error: str | None = None
        self.last_sync_error_at: datetime | None = None
        self.last_locations: dict[str, int] = {}

    @property
    def replay_writes(self) -> bool:
        """Schreibt der Replay WIRKLICH nach Pulpo? Nur im Echtbetrieb mit
        aktiviertem Rückschreiben."""
        return self.write_enabled and not self.test_mode


pulpo_runtime = PulpoRuntime()
