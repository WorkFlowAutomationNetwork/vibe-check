# --- Build stage: compile nuclei and pull its template library ---
FROM golang:1.25-bookworm AS nuclei-build

# Explicit GOBIN avoids relying on GOPATH/bin default location, which can
# vary (e.g. gets an arch-specific subdirectory under some cross-compile
# configurations) — pin the install destination so the later COPY is exact.
ENV GOBIN=/usr/local/go-bin
RUN mkdir -p "$GOBIN"

# Pinned, not @latest: an unpinned version could silently change CLI flags
# on a redeploy unrelated to this scanner, degrading NucleiScanner to a
# silent "ran clean, zero findings" result instead of a loud build break.
RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@v3.9.0

# -update-templates pulls the actual template YAMLs into ~/nuclei-templates
# (verified against nuclei v3.9.0's .templates-config.json on a real
# deploy — NOT ~/.config/nuclei, which only holds nuclei's own config/
# ignore-list files, not the templates themselves).
RUN "$GOBIN/nuclei" -update-templates

# --- gitleaks (committed-secret scanning) ---
# Pinned, not @latest — same rationale as Nuclei: an unpinned bump could
# silently change flags and degrade the repo scan.
FROM golang:1.25-bookworm AS gitleaks-build
ENV GOBIN=/usr/local/go-bin
RUN mkdir -p "$GOBIN"
RUN go install github.com/gitleaks/gitleaks/v8@v8.21.2

# --- Final stage ---
FROM python:3.12-slim

WORKDIR /app

# WeasyPrint (PDF report rendering) needs Pango/Cairo/GObject at runtime —
# not bundled with the pip package.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi8 shared-mime-info git \
    && rm -rf /var/lib/apt/lists/*

# Nuclei binary + templates baked in at build time (see
# docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md —
# template freshness is intentionally tied to redeploys, not runtime
# network calls).
COPY --from=nuclei-build /usr/local/go-bin/nuclei /usr/local/bin/nuclei
COPY --from=nuclei-build /root/.config/nuclei /root/.config/nuclei
COPY --from=nuclei-build /root/nuclei-templates /root/nuclei-templates
COPY --from=gitleaks-build /usr/local/go-bin/gitleaks /usr/local/bin/gitleaks

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
