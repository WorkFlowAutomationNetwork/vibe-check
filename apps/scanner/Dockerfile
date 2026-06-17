# --- Build stage: compile nuclei and pull its template library ---
FROM golang:1.22-bookworm AS nuclei-build

RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# -update-templates pulls into ~/.config/nuclei/templates for the user
# running the command (root, in this build stage).
RUN /root/go/bin/nuclei -update-templates

# --- Final stage ---
FROM python:3.12-slim

WORKDIR /app

# WeasyPrint (PDF report rendering) needs Pango/Cairo/GObject at runtime —
# not bundled with the pip package.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi8 shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Nuclei binary + templates baked in at build time (see
# docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md —
# template freshness is intentionally tied to redeploys, not runtime
# network calls).
COPY --from=nuclei-build /root/go/bin/nuclei /usr/local/bin/nuclei
COPY --from=nuclei-build /root/.config/nuclei /root/.config/nuclei

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
