from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.middleware.auth import verify_internal_key
from queue.tasks import run_scan

router = APIRouter()


class ScanRequest(BaseModel):
    scan_id: str
    url_id: str
    scan_type: Literal["passive", "active", "deep"]
    user_id: str


@router.post("/api/scans", status_code=202, dependencies=[Depends(verify_internal_key)])
def enqueue_scan(body: ScanRequest) -> dict:
    run_scan.delay(body.scan_id, body.url_id, body.scan_type, body.user_id)
    return {"job_id": body.scan_id}
