"""
Manual resolution actions for CMC packages — Section 9 of the process doc.

Endpoints let an admin/operator mark an EJECTED or FAILED package as
resolved, retry a failed completion, or soft-delete a state. The action is
broadcast as a synthetic event into the live event stream so the dashboard
reflects it immediately, without needing a separate DB read path.
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import get_current_user
from app.gateway.websocket import ws_manager


router = APIRouter(prefix="/packages", tags=["packages"])


class ActionRequest(BaseModel):
    machine_id: str = Field(..., description="Machine the package was on")
    reason: str = Field(..., min_length=1, max_length=500)
    tracking_code: str | None = None
    tracking_url: str | None = None


async def _broadcast_action(
    action: Literal["RESOLVE", "RETRY", "DELETE"],
    reference_id: str,
    data: ActionRequest,
    user: dict,
) -> dict:
    payload = {
        "reference_id": reference_id,
        "reason": data.reason,
        "resolved_by": user.get("email") or user.get("sub", "unknown"),
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.tracking_code:
        payload["tracking_code"] = data.tracking_code
    if data.tracking_url:
        payload["tracking_url"] = data.tracking_url

    severity_map = {"RESOLVE": "success", "RETRY": "info", "DELETE": "warning"}
    label_map = {"RESOLVE": "gelöst", "RETRY": "Wiederholung gestartet", "DELETE": "gelöscht"}

    await ws_manager.broadcast({
        "type": action,
        "severity": severity_map[action],
        "message": f"Paket {reference_id} {label_map[action]} ({payload['resolved_by']})",
        "machine_id": data.machine_id,
        "data": payload,
    })
    return {"ok": True, "action": action, "reference_id": reference_id}


@router.post("/{reference_id}/resolve")
async def resolve_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("RESOLVE", reference_id, data, user)


@router.post("/{reference_id}/retry")
async def retry_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("RETRY", reference_id, data, user)


@router.post("/{reference_id}/delete")
async def delete_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("DELETE", reference_id, data, user)
