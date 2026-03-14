"""
Insight Forge API - FastAPI Application
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import close_db, init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    if settings.environment == "dev":
        # Initialize database tables in dev mode
        await init_db()

        # Seed initial data
        from app.database import get_db_context
        from app.seeds.seed_data import seed_database

        async with get_db_context() as session:
            await seed_database(session)

    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title="Insight Forge API",
    description="Clinical Quality Measure development platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "environment": settings.environment,
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Insight Forge API",
        "version": "1.0.0",
        "docs": "/docs",
    }


# Import and include routers
from app.routers import (
    auth,
    classifier_feedback,
    code_generation,
    components,
    import_router,
    llm,
    measures,
    validation,
)

app.include_router(auth.router)  # Auth router has its own /api/auth prefix
app.include_router(measures.router, prefix="/api")
app.include_router(components.router, prefix="/api")
app.include_router(import_router.router, prefix="/api")
app.include_router(code_generation.router, prefix="/api")
app.include_router(validation.router, prefix="/api")
app.include_router(llm.router, prefix="/api")
app.include_router(classifier_feedback.router, prefix="/api")
