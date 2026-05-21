# Vibe-Check — Copilot Instructions

## Session start — always do this first

At the start of every conversation, read both of these files before doing anything else:

1. **`CLAUDE.md`** — architecture, conventions, tech stack, build rules
2. **`PROJECT_STATUS.md`** — current build state, what is built, what is broken, what to build next

Use `PROJECT_STATUS.md` to answer questions like:
- "What should we do next?"
- "Is X built?"
- "What's the status of Y?"
- "What's not working?"

## After every session — always update PROJECT_STATUS.md

Update `PROJECT_STATUS.md` whenever a session includes any of the following:

- A new page or component built or materially changed
- An API route added or modified
- A Supabase migration written or applied to the remote project
- A Stripe integration step completed (products, checkout, webhooks)
- A known issue fixed or a new issue discovered
- Any work on the scanner service (`apps/scanner/`)
- Environment variables added or documented

The update should reflect current reality — not plans. Mark things ✅ when done, ⚠️ when partial, ❌ when missing. Update the "Known Issues" and "What to Build Next" sections to match the state of the code as it actually exists.

## Project context

- **Repo:** `c:\Users\paddy\PC_CODING\Vibe-Check`
- **Web app:** `apps/web` — Next.js 14, TypeScript strict, App Router
- **Scanner:** `apps/scanner` — Python FastAPI + Celery (not yet started)
- **Database:** Supabase (project `lvkiflbpbtmlrgdftivt`), 14 migrations applied
- **Design system:** CSS variables in `apps/web/app/globals.css` — do not fight them with Tailwind utilities
- **Design reference:** HTML files in `/design/` — read before building any new page or component

## Key rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `SCANNER_INTERNAL_KEY` to the client
- Every scan task must call `consent.verify(url)` before any tool runs (once scanner is built)
- Server components by default — `'use client'` only when genuinely needed
- Zod validation on all API route inputs
- `scan_type` is the column name — not `.type`
