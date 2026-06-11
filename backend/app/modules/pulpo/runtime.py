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
        # OFF by default = Test-Modus = no writes reach Pulpo.
        self.write_enabled: bool = False
        # Last successful resync (for the settings status card).
        self.last_sync_at: datetime | None = None
        self.last_sync_orders: int = 0
        # Diagnostics: why the last resync failed (None = last run OK) and the
        # Lagerplatz distribution of the last successful LIVE queue pull
        # (e.g. {"CW2": 198}). Comparing this against the cache distribution
        # immediately shows whether the sidebar reflects Pulpo or stale cache.
        self.last_sync_error: str | None = None
        self.last_sync_error_at: datetime | None = None
        self.last_locations: dict[str, int] = {}

    @property
    def test_mode(self) -> bool:
        return not self.write_enabled


pulpo_runtime = PulpoRuntime()
