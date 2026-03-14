"""
FastAPI dependency injection utilities.
"""
from typing import Annotated, AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides an async database session.
    Use with FastAPI's Depends().
    """
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# Type alias for dependency injection
DbSession = Annotated[AsyncSession, Depends(get_db)]
