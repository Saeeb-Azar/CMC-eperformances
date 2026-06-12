import logging
import sys
import json
import threading
import itertools
from collections import deque
from datetime import datetime, timezone


_LEVEL_ORDER = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}


class RingBufferHandler(logging.Handler):
    """Hält die letzten N Log-Einträge im Speicher, damit das Dashboard ALLE
    Backend-Logs (Pulpo, DHL, Print, Gateway, …) live abrufen kann — ohne
    Server-Shell. Thread-sicher, bounded (kein Memory-Leak)."""

    def __init__(self, capacity: int = 4000) -> None:
        super().__init__()
        self._buf: deque = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._ids = itertools.count(1)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "id": next(self._ids),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "module": record.module,
                "message": record.getMessage(),
            }
            if record.exc_info and record.exc_info[1]:
                entry["exception"] = str(record.exc_info[1])
            with self._lock:
                self._buf.append(entry)
        except Exception:
            pass  # Logging darf NIE die App crashen

    def recent(self, limit: int = 500, since_id: int = 0,
               level: str | None = None, q: str | None = None) -> list[dict]:
        with self._lock:
            items = list(self._buf)
        if since_id:
            items = [e for e in items if e["id"] > since_id]
        if level:
            minl = _LEVEL_ORDER.get(level.upper(), 0)
            items = [e for e in items if _LEVEL_ORDER.get(e["level"], 0) >= minl]
        if q:
            ql = q.lower()
            items = [e for e in items if ql in e["message"].lower() or ql in e["logger"].lower()]
        return items[-limit:] if limit else items


# Modulweiter Ringpuffer — wird in setup_logging an den Root-Logger gehängt,
# damit er ALLE Logger (inkl. uvicorn/sqlalchemy via Propagation) einfängt.
log_ring = RingBufferHandler()


class JSONFormatter(logging.Formatter):
    """Structured JSON logging for production traceability."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "module": record.module,
            "message": record.getMessage(),
        }
        if hasattr(record, "tenant_id"):
            log_entry["tenant_id"] = record.tenant_id
        if hasattr(record, "machine_id"):
            log_entry["machine_id"] = record.machine_id
        if hasattr(record, "reference_id"):
            log_entry["reference_id"] = record.reference_id
        if hasattr(record, "event_type"):
            log_entry["event_type"] = record.event_type
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = str(record.exc_info[1])
        return json.dumps(log_entry)


def setup_logging(debug: bool = False) -> logging.Logger:
    logger = logging.getLogger("cmc_eperformances")
    logger.setLevel(logging.DEBUG if debug else logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)

    # Ringpuffer an den ROOT-Logger hängen → fängt unsere Logs (via Propagation)
    # UND uvicorn/sqlalchemy ab. Nur einmal hinzufügen (idempotent bei Reload).
    root = logging.getLogger()
    if log_ring not in root.handlers:
        root.addHandler(log_ring)
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)

    return logger


logger = setup_logging()
