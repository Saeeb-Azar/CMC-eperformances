from fastapi import HTTPException, status


class CMCBaseException(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail=detail)


class MachineNotFound(CMCBaseException):
    def __init__(self, machine_id: str):
        super().__init__(f"Machine '{machine_id}' not found", status.HTTP_404_NOT_FOUND)


class OrderNotFound(CMCBaseException):
    def __init__(self, reference_id: str):
        super().__init__(f"Order '{reference_id}' not found", status.HTTP_404_NOT_FOUND)


class InvalidStateTransition(CMCBaseException):
    def __init__(self, current: str, target: str):
        super().__init__(f"Cannot transition from '{current}' to '{target}'")


class DuplicateOrder(CMCBaseException):
    def __init__(self, barcode: str):
        super().__init__(f"Order with barcode '{barcode}' is already being processed")


class MachineConnectionError(CMCBaseException):
    def __init__(self, machine_id: str, reason: str):
        super().__init__(
            f"Machine '{machine_id}' connection error: {reason}",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
