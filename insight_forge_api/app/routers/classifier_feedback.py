"""
Classifier feedback REST API router.
Records user confirmations/overrides of catalogue type detection.
"""
from typing import Dict, List

from fastapi import APIRouter, HTTPException

from app.deps import DbSession
from app.schemas.validation import ClassifierFeedbackRequest, ClassifierFeedbackStatsDto
from app.services.classifier_feedback_service import ClassifierFeedbackService

router = APIRouter(prefix="/classifier", tags=["Classifier"])


@router.post("/feedback")
async def record_feedback(request: ClassifierFeedbackRequest, db: DbSession) -> Dict[str, bool]:
    """
    Record classifier feedback from a user confirmation/override.

    This data is used to improve the catalogue type detection algorithm.

    Args:
        request: Feedback data including detected type, confirmed type, and override flag

    Returns:
        {"recorded": true} on success, {"recorded": false} on validation error
    """
    service = ClassifierFeedbackService(db)
    recorded = await service.record_feedback(request)

    if not recorded:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid confirmedType: {request.confirmedType}",
        )

    return {"recorded": True}


@router.get("/feedback/stats", response_model=ClassifierFeedbackStatsDto)
async def get_feedback_stats(db: DbSession) -> ClassifierFeedbackStatsDto:
    """
    Get feedback statistics for analytics/debugging.

    Returns:
        Total feedback count, override rate, and breakdown by type
    """
    service = ClassifierFeedbackService(db)
    return await service.get_feedback_stats()


@router.get("/feedback/recent")
async def get_recent_feedback(db: DbSession, limit: int = 20) -> List[Dict]:
    """
    Get recent feedback entries.

    Args:
        limit: Maximum number of entries to return (default 20)

    Returns:
        List of recent feedback entries
    """
    service = ClassifierFeedbackService(db)
    return await service.get_recent_feedback(limit)


@router.get("/feedback/patterns")
async def get_override_patterns(db: DbSession) -> List[Dict]:
    """
    Get patterns of overrides to help improve classifier.

    Returns pairs of (detected_type, confirmed_type) with counts,
    sorted by frequency.

    Returns:
        List of override patterns with counts
    """
    service = ClassifierFeedbackService(db)
    return await service.get_override_patterns()
