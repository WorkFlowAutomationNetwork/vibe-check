# Document 03 — Trust page (review)

**Live URL once launched:** `https://vibe-check-app.com/trust`
**Status:** Built, no blank placeholders. Needs a "is every claim true and fair?" check.

> Read the **00-START-HERE** overview first.

---

## A. What this page is for

This is the public-facing "how, and from where, do you scan my site?" page. Two
audiences:

1. **Customers** deciding whether to trust us with a scan — they want to see we only
   scan verified targets and don't do anything destructive.
2. **Anyone who sees our scanner traffic** hitting their site and wants to confirm it's
   legitimate and allowlist it. The page lists the exact IP addresses our scanner uses.

Unlike the Terms and Privacy pages, there are no legal blanks to fill. The review need
here is different: **every claim on this page must be true and not overstated**, because
it's effectively a set of public promises about how we behave.

---

## B. The claims to sanity-check

Please confirm you're comfortable that each of these is accurate and fairly worded
(engineering has confirmed the underlying behaviour; your job is whether the *wording*
overpromises):

1. **"Ownership verification before any scan."** — *"Every URL must pass a DNS TXT or
   file-based ownership check before a single request is sent. Scans against unverified
   targets are refused at the job level, not just the UI."* ✅ True.

2. **"Non-destructive, scoped activity."** — *"Scans never modify or delete data on your
   systems. Active probes are scoped and rate-limited — some send crafted requests (e.g.
   login-endpoint rate-limit tests) but we never write to your database or alter
   application state."* ✅ True, and deliberately honest that it's **not** purely
   read-only (some real `POST` requests are sent). Please confirm this framing is candid
   enough — this was specifically softened from an earlier "read-only" claim that would
   have been misleading.

3. **"Declared infrastructure only."** — *"We scan exclusively from the IPs above."* The
   page lists 5 scanner IP addresses. ⚠️ **Engineering must confirm these 5 addresses
   are the real, current egress IPs of the scanner** before launch — if they're stale or
   wrong, this becomes a false public promise and customers' allowlists won't work. This
   is a technical verification, flagged here because it's a claim on a "trust" page.

4. **"You are responsible for authorisation."** — restates the Terms Section 1 point.
   Consistent with the Terms. ✅

---

## C. Full current text of the Trust page

**Heading:** How Vibe-Check scans, and from where.

**Intro:** We scan security from declared infrastructure, only against targets whose
owners have verified control. This page lists the IP addresses our scanner uses and
explains the safeguards around active scanning, so you can recognise our traffic and
allowlist it.

**Scanner egress IPs** (customers add these to their WAF / Cloudflare allowlist):
```
52.18.41.20
52.18.41.21
3.122.18.5
3.122.18.6
18.193.0.142
```
*"All scan traffic originates from these addresses. Add them to your WAF / Cloudflare
allowlist so active scans aren't throttled or blocked. Any 'security' traffic claiming
to be Vibe-Check from another address is not us."*

**Our scanning safeguards:**
- **Ownership verification before any scan** — Every URL must pass a DNS TXT or
  file-based ownership check before a single request is sent. Scans against unverified
  targets are refused at the job level, not just the UI.
- **Non-destructive, scoped activity** — Scans never modify or delete data on your
  systems. Active probes are scoped and rate-limited — some send crafted requests (e.g.
  login-endpoint rate-limit tests) but we never write to your database or alter
  application state. We store likelihood assessments and aggregate counts, never the
  contents of your data.
- **Declared infrastructure only** — We scan exclusively from the IPs above. This is our
  commitment that scan activity is authorised, scoped, and attributable.
- **You are responsible for authorisation** — You confirm you own, or are authorised to
  test, every target you submit. Scanning systems you do not control may be illegal —
  see our Terms.

**Footer contact:** security@vibe-check-app.com

---

## D. One consistency note

The Trust page, Terms (Section 1), and Privacy Policy (Section 1) all make overlapping
promises — "ownership verified before scanning", "we don't store your data's contents",
"you're responsible for authorisation". Worth a quick cross-read to make sure the three
pages say the **same** thing in compatible words, so nothing on one page contradicts
another. If you spot a mismatch, flag it and we'll align them.
