"""
Classifier feedback service for recording user confirmations/overrides.
"""
import logging
from typing import Dict, List, Set

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.validation import ClassifierFeedback
from app.schemas.validation import ClassifierFeedbackRequest, ClassifierFeedbackStatsDto

logger = logging.getLogger(__name__)

# Valid catalogue types (matching frontend catalogueClassifier.js)
VALID_TYPES: Set[str] = {
    "eCQM",
    "MIPS_CQM",
    "HEDIS",
    "QOF",
    "Registry",
    "Custom",
    "Clinical_Standard",
}


class ClassifierFeedbackService:
    """Service for recording and analyzing classifier feedback."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_feedback(self, request: ClassifierFeedbackRequest) -> bool:
        """
        Record classifier feedback from a user confirmation/override.

        Returns True if feedback was recorded successfully.
        """
        # Validate confirmed type
        if request.confirmedType not in VALID_TYPES:
            logger.warning(f"Invalid confirmedType: {request.confirmedType}")
            return False

        # Build entity
        feedback = ClassifierFeedback(
            document_name=request.documentName,
            detected_type=request.detectedType,
            confirmed_type=request.confirmedType,
            was_overridden=request.wasOverridden,
            confidence=request.confidence,
            signals="; ".join(request.signals) if request.signals else None,
        )

        self.db.add(feedback)
        await self.db.commit()

        logger.info(
            f"[ClassifierFeedback] Document: {request.documentName}, "
            f"Detected: {request.detectedType}, "
            f"Confirmed: {request.confirmedType}, "
            f"Override: {request.wasOverridden}"
        )

        return True

    async def get_feedback_stats(self) -> ClassifierFeedbackStatsDto:
        """Get feedback statistics for analytics/debugging."""
        # Total count
        total_result = await self.db.execute(
            select(func.count()).select_from(ClassifierFeedback)
        )
        total_count = total_result.scalar() or 0

        # Override count
        override_result = await self.db.execute(
            select(func.count())
            .select_from(ClassifierFeedback)
            .where(ClassifierFeedback.was_overridden == True)
        )
        override_count = override_result.scalar() or 0

        # Calculate override rate
        override_rate = (override_count / total_count) if total_count > 0 else 0.0

        # Count by type
        by_type: Dict[str, int] = {}
        type_result = await self.db.execute(
            select(
                ClassifierFeedback.confirmed_type,
                func.count().label("count")
            )
            .group_by(ClassifierFeedback.confirmed_type)
        )
        for row in type_result:
            by_type[row.confirmed_type] = row.count

        return ClassifierFeedbackStatsDto(
            totalFeedback=total_count,
            overrideRate=override_rate,
            byType=by_type,
        )

    async def get_recent_feedback(self, limit: int = 20) -> List[Dict]:
        """Get recent feedback entries."""
        result = await self.db.execute(
            select(ClassifierFeedback)
            .order_by(ClassifierFeedback.created_at.desc())
            .limit(limit)
        )
        feedback_list = result.scalars().all()

        return [
            {
                "id": f.id,
                "documentName": f.document_name,
                "detectedType": f.detected_type,
                "confirmedType": f.confirmed_type,
                "wasOverridden": f.was_overridden,
                "confidence": f.confidence,
                "createdAt": f.created_at.isoformat() if f.created_at else None,
            }
            for f in feedback_list
        ]

    async def get_override_patterns(self) -> List[Dict]:
        """
        Get patterns of overrides to help improve classifier.
        Returns pairs of (detected_type, confirmed_type) with counts.
        """
        result = await self.db.execute(
            select(
                ClassifierFeedback.detected_type,
                ClassifierFeedback.confirmed_type,
                func.count().label("count")
            )
            .where(ClassifierFeedback.was_overridden == True)
            .group_by(
                ClassifierFeedback.detected_type,
                ClassifierFeedback.confirmed_type
            )
            .order_by(func.count().desc())
        )

        return [
            {
                "detectedType": row.detected_type,
                "confirmedType": row.confirmed_type,
                "count": row.count,
            }
            for row in result
        ]
