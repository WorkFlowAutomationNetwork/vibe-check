# Vibe-Check — Legal & Trust Review Pack

**Prepared for:** Amy
**Date:** 30 June 2026
**Prepared by:** Patrick (WorkFlow Automation Network)

Thanks for taking a look at this. This pack has everything you need to review the
legal and trust-facing pages of **Vibe-Check** before it launches. You do **not**
need to read any code — each document below is self-contained and quotes the actual
text that will appear on the live site.

---

## 1. What Vibe-Check is (plain English)

Vibe-Check is a **security-auditing tool for small web apps**. The target customer is
solo founders and indie developers who built something quickly with AI coding tools
(Claude, Cursor, v0, Lovable, etc.) and want to know whether it's actually secure
before they put it in front of real users.

**How it works for a customer:**

1. They sign up (email + password — a free account is required).
2. They enter a URL they want scanned.
3. **They must prove they own/control that URL** before any scan runs — by adding a
   DNS record or uploading a file we specify. This ownership check is the legal and
   technical heart of the product.
4. We run automated security checks against the site and give them a graded report
   (A–F), in plain English, with fix suggestions.
5. Paid tiers add a downloadable PDF, a "Vibe-Checked" badge they can embed, and
   continuous monitoring.

**What we actually check** (this matters for accuracy of the legal copy): security
headers, TLS/SSL certificate health, exposed Supabase database tables and storage
buckets, secrets accidentally left in the site's code, login rate-limiting, a library
of known-vulnerability templates (Nuclei), and secrets committed to a connected
GitHub repository's history. We do **not** do prompt-injection testing, dependency-CVE
matching, or auth-bypass probing despite some earlier marketing implying we did — that
copy has now been corrected.

**Pricing (provisional):** Free passive scan · $9 one-off full scan · $19/month
monitoring. ⚠️ **Prices are not yet finalised** — they may go up before launch, so
please don't treat the dollar figures as fixed. The refund clause in the Terms is the
part that matters legally, and it doesn't depend on the exact price.

**Business / legal context:**

- The operating entity is **Australian**. The Terms are written around **Australian
  Consumer Law (ACL)** and refund rights, with currency in mind accordingly.
- The scanning servers run in the **EU** (Ireland and Frankfurt, on Fly.io), so some
  customer data is processed outside Australia — this is why the Privacy Policy has an
  international-transfers section.
- Third parties that touch data: **Supabase** (database/login/file storage),
  **Stripe** (payments), **Resend** (email), **Fly.io** (runs the scanner).

---

## 2. The single biggest legal risk to sanity-check

Vibe-Check sends real network requests to other people's websites. If a customer
points it at a site they **don't** own, that can be illegal (computer-misuse laws).
Our protections are:

1. **Ownership verification** before any scan (technical control).
2. A clause in the **Terms** where the customer warrants they're authorised and
   **indemnifies us** if they aren't.

Please pay particular attention to whether that indemnity + the "you are responsible
for authorisation" framing is strong enough, and whether the **"no guarantee of
security"** and **limitation-of-liability** clauses adequately protect us if a site we
gave a passing grade later gets breached. These are in **Document 01 (Terms)**.

---

## 3. What's in this pack

| Document | What it covers | What we need from you |
|---|---|---|
| **01 — Terms of Service review** | The full Terms text, the authorisation/indemnity clause, security disclaimer, liability cap, refund policy, governing law. | Legal sanity-check + fill the bracketed blanks. |
| **02 — Privacy Policy review** | What data we collect, sub-processors, retention periods, international transfers, user rights. | Confirm it's complete/accurate + fill blanks. |
| **03 — Trust page review** | The public "how and from where we scan" page. No legal blanks, but the claims must be true. | Confirm the claims are fair and not overstated. |

---

## 4. The blanks that need a real answer

Every page currently has `[BRACKETED PLACEHOLDERS]` where a real value is needed. The
full list per page is inside each document, but here are the ones that need a **person
to decide**, collected in one place:

- **Legal entity name** — the exact registered name of the operating business.
- **Postal address** — registered business address (appears on Terms + Privacy).
- **Effective date** — the date these documents take effect (also drives a
  `TERMS_VERSION` value the sign-up page records against each user's acceptance).
- **Governing law / jurisdiction / court venue** — presumably an Australian
  state (e.g. the state of registration). Please confirm.
- **Free-tier liability cap** — a small fixed sum (the draft suggests ~USD 50) that
  caps our liability to non-paying users. Confirm the figure and currency.
- **Data-protection contact / "DPO"** — who is named as the privacy contact.
- **International-transfer mechanism** — confirm whether Standard Contractual Clauses
  (or another mechanism) is the right basis given EU processing of any EU/UK users'
  data.
- **Sub-processor DPA links** — links to each provider's Data Processing Agreement
  (Supabase, Stripe, Resend, Fly.io).

---

## 5. Two things that must be operationally true (not just written)

The Privacy Policy makes two promises that the engineering side must guarantee are
actually enforced before launch. Flagging so you know they're claims with teeth:

1. **30-day retention / deletion** — logs purge after 30 days; deleting an account
   hard-deletes all of that user's data within 30 days. (A purge job + deletion
   cascade still need to be verified end-to-end.)
2. **Signed DPAs with every sub-processor** — we should have the actual agreements in
   place with Supabase, Stripe, Resend, and Fly.io, not just link to them.

---

## 6. How to give feedback

Whatever's easiest for you — inline comments, a marked-up copy, or just a list of
"change X to Y / this clause needs Z." If a clause is fine as-is, a simple "OK" is
perfect so we know it's been seen. Thank you!
