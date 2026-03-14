"""
Pydantic schemas for Import-related DTOs.
Accepts the Zustand localStorage export format.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ImportRequest(BaseModel):
    """
    Request DTO for importing data from Zustand export format.
    Accepts the full localStorage export from the frontend.
    """

    measures: List[Dict[str, Any]] = []
    components: List[Dict[str, Any]] = []
    validationTraces: List[Dict[str, Any]] = []
    codeStates: Optional[Dict[str, Any]] = None
    version: Optional[int] = None
    exportedAt: Optional[str] = None


class ImportResultDto(BaseModel):
    """Result of an import operation."""

    componentsImported: int = 0
    measuresImported: int = 0
    validationTracesImported: int = 0
    success: bool = True
    message: Optional[str] = None
