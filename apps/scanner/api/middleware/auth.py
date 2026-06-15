import hmac
from fastapi import Header, HTTPException
from lib.settings import settings


def verify_internal_key(x_internal_key: str = Header(...)) -> None:
    if not hmac.compare_digest(x_internal_key, settings.scanner_internal_key):
        raise HTTPException(status_code=401, detail="Unauthorized")
