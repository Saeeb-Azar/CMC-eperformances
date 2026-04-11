"""
CMC CartonWrap CIS Protocol Parser

Based on the CMC CW1000 CIS rel 4.0 Simulator and CMC S.p.A. documentation.
TCP communication on port 15001.

Message direction:
  CMC → CIS (machine sends, UPPERCASE): ENQ, IND, ACK, INV, LAB1, LAB2, END, REM, HBT
  CIS → CMC (we respond, lowercase):    enq, ind, ack, inv, lab1, lab2, end, rem, hbt, sts
"""

from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timezone


class MessageType(str, Enum):
    # Machine → CIS
    ENQ = "ENQ"    # Enquiry: barcode scanned
    IND = "IND"    # Inducted: item on conveyor
    ACK = "ACK"    # Acknowledge: 3D measurement done
    INV = "INV"    # Invoice: request invoice print (optional)
    LAB1 = "LAB1"  # Label 1: request shipping label at primary labeler
    LAB2 = "LAB2"  # Label 2: request label at secondary labeler (optional)
    END = "END"    # End: final box result with verification
    REM = "REM"    # Remove: item manually removed from conveyor
    HBT = "HBT"    # Heartbeat: connection check
    STS = "STS"    # Status: machine status query/response


class MachineStatus(str, Enum):
    STOP = "STOP"
    RUNNING = "RUNNING"
    PAUSE = "PAUSE"
    ERROR = "ERROR"


class AckResult(str, Enum):
    PROCESSABLE = "PROCESSABLE"
    CUT = "CUT"         # Rejected: needs cutting (out of range)
    FORMAT = "FORMAT"    # Rejected: wrong format


@dataclass
class ENQMessage:
    """Scanner station: barcode scanned, request order lookup."""
    barcode: str
    barcode_type: str = ""       # e.g. "BC0001"
    source: str = "Keyboard"     # Keyboard, Camera, HandScanner
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ENQResponse:
    """Response to ENQ: accept or reject with order info."""
    reference_id: str
    result: int                  # 1 = accept, 0 = reject
    item_validated: bool = True
    description: str = ""
    label_match: str = ""        # Expected barcode on label for exit verification
    lab1_enabled: bool = True    # Use primary labeler
    lab2_enabled: bool = False   # Use secondary labeler (optional)
    inv_enabled: bool = False    # Print invoice (optional)
    hazmat_flag: bool = False


@dataclass
class INDMessage:
    """Induction station: item entered the conveyor."""
    reference_id: str
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class INDResponse:
    reference_id: str
    result: int = 1


@dataclass
class ACKMessage:
    """3D sensor station: dimensions measured."""
    reference_id: str
    good: bool                   # True = accepted, False = rejected
    event: int = 0
    area_carton: int = 0         # Carton type/area selection
    height_mm: int = 0           # Height in mm
    length_mm: int = 0           # Length in mm
    width_mm: int = 0            # Width in mm
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ACKResponse:
    reference_id: str
    result: int                  # 1 = processable, 0 = rejected
    item_validated: bool = True
    flag: str = "PROCESSABLE"    # PROCESSABLE, CUT, FORMAT


@dataclass
class INVMessage:
    """Invoice station: request invoice/delivery note print."""
    reference_id: str
    pdf_pages: int = 1
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class INVResponse:
    reference_id: str
    result: int = 1              # 1 = printed
    match_barcode: str = ""


@dataclass
class LABMessage:
    """Labeler station: request shipping label. Used for LAB1 and LAB2."""
    reference_id: str
    labeler: str = "LAB1"        # "LAB1" or "LAB2"
    good: bool = True
    event: int = 0
    weight_scale: int = 0        # Actual weight from scale (grams)
    weight_carton: int = 0       # Carton weight (grams)
    weight_content: int = 0      # Content weight (grams)
    needs_label: bool = True
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class LABResponse:
    reference_id: str
    result: int = 1              # 1 = label generated, 0 = error
    match_barcode: str = ""      # Barcode to verify at exit scanner
    label_content_base64: str = ""  # Base64 encoded label PDF
    label_url: str = ""          # Alternative: URL to label
    status: str = ""


@dataclass
class ENDMessage:
    """Exit verifier station: final result for the package."""
    reference_id: str
    status: int = 1              # 1 = success (label verified), != 1 = rejected
    good: bool = True
    sizes_length: int = 0        # Final box length (mm)
    sizes_width: int = 0         # Final box width (mm)
    sizes_height: int = 0        # Final box height (mm)
    weight: int = 0              # Final box weight (grams)
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ENDResponse:
    reference_id: str
    result: int = 1


@dataclass
class REMMessage:
    """Item manually removed from conveyor."""
    reference_id: str
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class REMResponse:
    reference_id: str
    result: int = 1


@dataclass
class HBTMessage:
    """Heartbeat: periodic connection check."""
    machine_id: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class HBTResponse:
    result: int = 1


@dataclass
class STSResponse:
    """Machine status response."""
    machine_id: str = ""
    status: MachineStatus = MachineStatus.RUNNING
    online: bool = True
