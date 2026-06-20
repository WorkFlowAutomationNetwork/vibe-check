from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.middleware.auth import verify_internal_key
from jobs.tasks import run_repo_scan

router = APIRouter()


class RepoScanRequest(BaseModel):
    repo_scan_id: str
    repo_id: str
    user_id: str


@router.post("/api/repo-scans", status_code=202,
             dependencies=[Depends(verify_internal_key)])
def enqueue_repo_scan(body: RepoScanRequest) -> dict:
    run_repo_scan.delay(body.repo_scan_id, body.repo_id, body.user_id)
    return {"job_id": body.repo_scan_id}
