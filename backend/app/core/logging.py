import logging
import sys
import json
from datetime import datetime, timezone


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

    return logger


logger = setup_logging()
