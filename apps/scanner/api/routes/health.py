from fastapi import APIRouter
from lib.settings import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": settings.scanner_version}
