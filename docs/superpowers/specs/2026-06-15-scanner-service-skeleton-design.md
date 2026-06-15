# Scanner Service Skeleton — Design Spec

**Date:** 2026-06-15
**Scope:** Step 1 — FastAPI skeleton, Celery + Redis queue, passive scan modules (headers + TLS), consent check, Dockerfile. No CLI tools (Nuclei, SQLmap, DalFox) in this step.

---

## Goals

- Get the scanner service running as a deployable Python service on Fly.io
- Enable end-to-end passive scans: user submits URL → scan runs → findings in Supabase → report page reads real data
- Establish the architecture for all future scan modules to slot into

---

## Architecture

Two services communicate over HTTP. The web app never executes scans directly.

```
Browser
  └─▶ POST /api/scans (Next.js/Vercel)
        ├─ Creates scan record in Supabase (status=pending)
        └─ POSTs {scan_id, url_id, scan_type, user_id} to SCANNER_API_URL/api/scans
              └─ Scanner enqueues Celery task → returns {job_id: scan_id}

Browser polls GET /api/scans?id=<scan_id>
  └─ Next.js reads scan status from Supabase (no scanner involvement)

Celery worker (Fly.io):
  ├─ Sets scan status=running in Supabase
  ├─ consent.verify(url_id) — aborts if url.verified != true
  ├─ Runs passive scanners: headers.py, tls.py
  ├─ Writes findings rows to Supabase
  ├─ Calculates grade via grader.py
  └─ Sets scan status=completed with grade + score
```

### What changes in the web app

- `/api/scans/route.ts` — replace BullMQ `scanQueue.add(...)` with `fetch(SCANNER_API_URL/api/scans, ...)` using `X-Internal-Key` header
- `lib/redis/client.ts` — remove (no longer needed by web app)
- Remove `bullmq` and `ioredis` from `apps/web/package.json`

---

## Scanner Service File Structure

```
apps/scanner/
├── api/
│   ├── main.py                  # FastAPI app, mounts routers, registers middleware
│   ├── routes/
│   │   ├── health.py            # GET /health → {status: "ok", version: str}
│   │   └── scans.py             # POST /api/scans → enqueue task, return {job_id}
│   └── middleware/
│       └── auth.py              # Dependency: validates X-Internal-Key header
├── queue/
│   ├── config.py                # Celery app instance + Redis broker/backend config
│   ├── worker.py                # Entry point: `celery -A queue.worker worker`
│   └── tasks.py                 # run_scan task — orchestrates consent + scanners + DB writes
├── scanners/
│   ├── base.py                  # Abstract BaseScanner, Finding dataclass
│   ├── headers.py               # HTTP security headers passive check
│   └── tls.py                   # TLS/SSL check via sslyze
├── lib/
│   ├── supabase.py              # supabase-py service role client (singleton)
│   ├── consent.py               # verify url.verified=true before any scan runs
│   └── storage.py               # PDF upload stub (not implemented in Step 1)
├── reports/
│   └── grader.py                # Calculates A–F grade from list of findings
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## API Endpoints

### `GET /health`
- Auth: none
- Response: `{"status": "ok", "version": "0.1.0"}`
- Used by Fly.io health checks and the admin settings page

### `POST /api/scans`
- Auth: `X-Internal-Key` header must match `SCANNER_INTERNAL_KEY` env var
- Body: `{"scan_id": uuid, "url_id": uuid, "scan_type": "passive"|"active"|"deep", "user_id": uuid}`
- Response 202: `{"job_id": "<scan_id>"}`
- Response 401: missing/invalid key
- Response 422: invalid body
- Behaviour: enqueues `run_scan` Celery task and returns immediately

---

## Auth Middleware

`api/middleware/auth.py` — FastAPI dependency injected into `POST /api/scans`:

```python
def verify_internal_key(x_internal_key: str = Header(...)):
    if not hmac.compare_digest(x_internal_key, settings.SCANNER_INTERNAL_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")
```

Uses `hmac.compare_digest` to prevent timing attacks.

---

## Queue

**Broker + backend:** Redis (Fly.io managed Redis, free tier up to 256MB)

**Celery config (`queue/config.py`):**
- `task_serializer = "json"`
- `result_expires = 3600`
- `task_acks_late = True` (job not acknowledged until complete — prevents loss on worker crash)
- `task_reject_on_worker_lost = True`

**Task: `run_scan`** (`queue/tasks.py`):
```
1. Update scan.status = 'running', scan.started_at = now()
2. consent.verify(url_id) — raises ConsentError if not verified → mark failed, abort
3. Fetch url string from Supabase
4. Run enabled scanners based on scan_type:
   - passive: [HeadersScanner, TLSScanner]
   - active/deep: same for now (active tools not in Step 1)
5. Collect all Finding objects
6. Bulk-insert findings into Supabase findings table
7. Calculate grade + score via grader.py
8. Update scan: status='completed', grade, score, completed_at=now(), scanner_version='0.1.0'
```

On any unhandled exception: mark scan as `failed`, log error to activity_log.

**Retries:** 3 attempts, exponential backoff starting at 5s. After 3 failures → status=`failed`.

---

## Passive Scan Modules

### `Finding` dataclass (`scanners/base.py`)

```python
@dataclass
class Finding:
    severity: Literal['critical', 'high', 'medium', 'low', 'info', 'pass']
    category: str
    title: str
    description: str
    what_we_did: str
    remediation: str
```

### `BaseScanner` (`scanners/base.py`)

```python
class BaseScanner(ABC):
    def __init__(self, url: str, timeout: int = 30): ...

    @abstractmethod
    def run(self) -> list[Finding]: ...
```

### `headers.py` — HTTP Security Headers

Uses `httpx` to fetch the URL (follow redirects, 10s timeout). Checks each header:

| Header | Missing severity | Notes |
|---|---|---|
| `Content-Security-Policy` | high | Present but `unsafe-inline`/`unsafe-eval` → medium |
| `Strict-Transport-Security` | high | Must have `max-age` ≥ 31536000 |
| `X-Content-Type-Options` | medium | Must be `nosniff` |
| `X-Frame-Options` | medium | `DENY` or `SAMEORIGIN` |
| `Referrer-Policy` | low | Any value = pass |
| `Permissions-Policy` | low | Any value = pass |

Each present + correct header generates a `pass` finding. Missing/misconfigured generates a finding at the severity above.

### `tls.py` — TLS/SSL Check

Uses `sslyze` (Python library, no CLI). Scans target host on port 443.

| Check | Condition | Severity |
|---|---|---|
| Certificate valid | Expired | critical |
| Certificate expiry | < 30 days | high |
| TLS version | Only TLS 1.0 or 1.1 available | high |
| TLS version | TLS 1.3 supported | pass |
| TLS version | TLS 1.2 minimum available | pass |
| Cipher suites | Weak ciphers (RC4, DES, 3DES) | high |
| HSTS header | Missing on HTTPS | medium |

`tls.py` receives the hostname extracted from the URL (not the full URL).

---

## Grade Calculation (`reports/grader.py`)

```
score = 100
score -= 25 × (count of critical findings)
score -= 15 × (count of high findings)
score -= 8  × (count of medium findings)
score -= 3  × (count of low findings)
score = max(0, score)

A: 90–100
B: 75–89
C: 60–74
D: 40–59
F:  0–39
```

`pass` and `info` findings do not affect score.

---

## Consent Check (`lib/consent.py`)

Before any scanner runs, `consent.verify(url_id)` queries Supabase:

```sql
SELECT verified FROM urls WHERE id = :url_id AND verified = true
```

If the row does not exist or `verified = false`, raises `ConsentError`. The task catches this, marks the scan `failed` with reason `"URL not verified"`, and logs to `activity_log`. No scan tool ever runs against an unverified URL.

---

## Supabase Client (`lib/supabase.py`)

Uses `supabase-py` with the **service role key** (bypasses RLS). Singleton pattern — one client instance reused across tasks.

Never expose the service role key via any API response or log.

---

## Environment Variables

```bash
# apps/scanner/.env.example
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=redis://localhost:6379
SCANNER_INTERNAL_KEY=           # Must match SCANNER_INTERNAL_KEY in apps/web
SCANNER_VERSION=0.1.0
MAX_CONCURRENT_SCANS=5
```

---

## Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Celery worker is started as a separate process/command, not in the same container entrypoint. On Fly.io this is configured via `fly.toml` processes section.

---

## requirements.txt (Step 1)

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
celery[redis]==5.4.0
redis==5.0.8
httpx==0.27.0
pydantic==2.8.0
pydantic-settings==2.4.0
supabase==2.7.0
sslyze==6.0.0
python-dotenv==1.0.1
```

---

## Fly.io Deploy Notes

- Two processes in `fly.toml`: `web` (uvicorn) and `worker` (celery)
- Redis via Fly.io managed Redis add-on (free tier, internal network)
- `SCANNER_INTERNAL_KEY` set as a Fly secret: `fly secrets set SCANNER_INTERNAL_KEY=<value>`
- Health check: `GET /health` on port 8000

---

## Out of Scope for Step 1

- Nuclei, SQLmap, DalFox, SecretFinder (no CLI tools yet)
- PDF generation (`reports/renderer.py`)
- Badge creation on scan completion
- Email notifications on scan complete
- `active` and `deep` scan types run the same passive modules as `passive` for now
