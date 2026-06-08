"""Pydantic-Schemas für die Pulpo-Webhook-Payloads.

⚠ Aktuell sehr permissive Schemas (extra-Felder erlaubt, viel optional)
weil wir die exakte Pulpo-Payload-Form noch nicht kennen. Sobald die
ersten Webhooks bei uns ankommen, sehen wir im Log das echte JSON und
ziehen die Felder fest. Bis dahin nehmen wir alles an und persistieren
es als `raw_payload`, damit nichts verloren geht.
"""

from typing import Any
from pydantic import BaseModel, ConfigDict


class PulpoWebhookEnvelope(BaseModel):
    """Minimaler Envelope um den Payload entgegenzunehmen — alles weitere
    fließt in raw_payload und wird beim Parsen extrahiert.

    Erwartete Form (per Doku, noch zu bestätigen):
      {
        "event": "packing_order_created" | "packing_order_finished" | "box_closed",
        "data": { ... },
        "timestamp": "...",
        "tenant": "..."
      }
    """
    model_config = ConfigDict(extra="allow")
