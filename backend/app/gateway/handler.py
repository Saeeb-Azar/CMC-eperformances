"""
Event dispatcher: routes incoming CMC messages to the appropriate module handlers.

Each message type (ENQ, IND, ACK, INV, LAB1, LAB2, END, REM, HBT) is dispatched
to its handler which processes the event, updates state, and returns a response.
"""

from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from app.core.logging import logger
from app.gateway.protocol import MessageType


# Registry of event handlers per message type
_handlers: dict[MessageType, list[Callable]] = {msg_type: [] for msg_type in MessageType}


def on_event(event_type: MessageType):
    """Decorator to register a handler for a specific CMC message type."""

    def decorator(func: Callable[..., Coroutine[Any, Any, Any]]):
        _handlers[event_type].append(func)
        return func

    return decorator


async def dispatch_event(
    machine_id: str,
    event_type: MessageType,
    payload: dict,
) -> dict | None:
    """
    Dispatch an incoming CMC event to all registered handlers.

    Returns the response from the first handler that returns a non-None result.
    Also notifies all audit/analytics listeners.
    """
    logger.info(
        f"Event {event_type.value} from machine {machine_id}",
        extra={
            "event_type": event_type.value,
            "machine_id": machine_id,
            "reference_id": payload.get("reference_id", ""),
        },
    )

    event_data = {
        "machine_id": machine_id,
        "event_type": event_type.value,
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    response = None
    for handler in _handlers.get(event_type, []):
        try:
            result = await handler(event_data)
            if result is not None and response is None:
                response = result
        except Exception as e:
            logger.error(
                f"Handler error for {event_type.value}: {e}",
                extra={"event_type": event_type.value, "machine_id": machine_id},
                exc_info=True,
            )

    return response
