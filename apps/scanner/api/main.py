from fastapi import FastAPI
from api.routes.health import router as health_router
from api.routes.scans import router as scans_router
from api.routes.repo_scans import router as repo_scans_router

app = FastAPI(title="Vibe-Check Scanner", version="0.1.0", docs_url=None, redoc_url=None)

app.include_router(health_router)
app.include_router(scans_router)
app.include_router(repo_scans_router)
