# Document 02 — Privacy Policy (review)

**Live URL once launched:** `https://vibe-check-app.com/privacy`
**Status:** Draft. Contains bracketed placeholders. Needs your sign-off + the blanks filled.

> Read the **00-START-HERE** overview first for what the product does and what data
> flows where.

---

## A. What this page is for

It tells users what personal data we collect, why, who we share it with, how long we
keep it, and what rights they have. Because our scanning servers run in the EU, it also
needs to cover international data transfers correctly.

---

## B. The questions we'd most like your view on

1. **Sub-processors (Section 3).** We name **Supabase, Stripe, Resend, and Fly.io** as
   the only third parties that touch data, and say we don't sell personal data. Is the
   list complete and the disclosure adequate? Each needs a link to its Data Processing
   Agreement (currently `[link DPA]`).

2. **International transfers (Section 4).** Customer data is processed in the **EU
   (Ireland + Frankfurt)** while the operating entity is Australian. For any EU/UK
   users, we say we rely on Standard Contractual Clauses. **Is SCC the right mechanism
   here, and is anything needed for the Australia↔EU direction?** The draft explicitly
   flags "[Confirm transfer mechanism with counsel.]" — this is the spot.

3. **Retention (Section 5).** We promise: logs purged after 30 days; on account
   deletion, all URLs/scans/findings/badges/PDFs hard-deleted within 30 days. Are these
   periods defensible, and is anything (e.g. a legal/tax retention exception for billing
   records) missing?

4. **Legal bases (Section 2).** We rely on contract, legitimate interests, and consent.
   Appropriate? Is anything required for Australian Privacy Principles (APPs)
   specifically, given the entity is Australian — e.g. an APP-style "open and
   transparent management of personal information" framing rather than only a GDPR-style
   one?

5. **User rights (Section 6).** Access/export/correct/delete/object/withdraw-consent.
   Complete for both GDPR and the Australian Privacy Act? Should we name a specific
   response timeframe?

---

## C. Placeholders to fill (this page cannot go live until these are real)

| Placeholder in the text | What it needs |
|---|---|
| `[EFFECTIVE DATE]` (top) | Date the policy takes effect. |
| `[LEGAL ENTITY NAME]` / `[LEGAL ENTITY NAME, ADDRESS]` | Registered name + address of the data controller. |
| `[link DPA]` (×4: Supabase, Stripe, Resend, scanner host) | Link to each provider's Data Processing Agreement. |
| `[Scanner host — Railway / Fly.io / Hetzner]` (Section 3) | This is **Fly.io** — replace the placeholder accordingly. |
| `[REGION(S)]` (Section 4) | The actual processing regions — **EU: Ireland + Frankfurt** (plus wherever Supabase is hosted — confirm Supabase project region). |
| `[Confirm transfer mechanism with counsel.]` (Section 4) | Your confirmation of the correct transfer basis. |
| `[LEGAL ENTITY / DPO NAME]` (Section 9) | Named privacy/data-protection contact. |
| `[POSTAL ADDRESS]` (Section 9) | Business postal address. |

---

## D. Full current text of the Privacy Policy

> Exact copy as it will render (bracketed items are the placeholders above).

**Preamble.** This Privacy Policy explains how **[LEGAL ENTITY NAME]** ("Vibe-Check",
"we") collects, uses, and protects personal data when you use the Service. The data
controller is **[LEGAL ENTITY NAME, ADDRESS]**.

**1. What we collect.**
- **Account data:** your email address and, optionally, your name.
- **Target data:** the URLs you submit, ownership-verification tokens, and verification method.
- **Scan results:** security findings, grades, and scan history for your targets. We
  store likelihood assessments and aggregate counts — not the contents of data read from
  your systems.
- **Activity & logs:** activity log, webhook log, and basic usage/IP telemetry used for
  security, abuse prevention, and operating the Service.
- **Billing data:** Stripe billing metadata (plan, subscription status,
  customer/subscription identifiers). We do **not** store your card number — Stripe
  handles card data; we never see it.

**2. Why we use it (legal bases).**
- **To perform our contract with you** — running scans, producing reports, managing your account and billing.
- **Legitimate interests** — securing and improving the Service, preventing abuse and fraud.
- **Consent** — only where required, e.g. any optional marketing email (which you can withdraw at any time).

**3. Sub-processors.** We share data with the following processors strictly to operate
the Service:
- **Supabase** — database, authentication, and file storage. `[link DPA]`
- **Stripe** — payment processing. `[link DPA]`
- **Resend** — transactional email delivery. `[link DPA]`
- **[Scanner host — Railway / Fly.io / Hetzner]** — runs the scanning service. `[link DPA]`

We do not sell your personal data.

**4. International transfers.** Our infrastructure may process data in **[REGION(S)]**.
Where personal data of EU/UK users is transferred outside the EEA/UK, we rely on
appropriate safeguards such as the Standard Contractual Clauses. **[Confirm transfer
mechanism with counsel.]**

**5. How long we keep it (retention).**
- **Scan findings & metadata:** kept for the lifetime of your account so your report
  history remains accessible. When you delete your account, all findings are purged as
  described below.
- **Report PDFs:** stored for the lifetime of your account and deleted when your account is deleted.
- **Activity & webhook logs:** retained for **30 days**, then purged.
- **Deleted accounts:** URLs, scans, findings, badges, and stored report PDFs are
  hard-deleted or irreversibly anonymised within **30 days** of account deletion.

**6. Your rights.** Depending on your location, you have rights to access, export,
correct, delete, and object to processing of your personal data, and to withdraw
consent. You can delete your account and associated data from the app, or contact us to
exercise any right. We respond within the period required by applicable law.

**7. Payments & PCI.** Payments are handled by Stripe using its hosted Checkout and
Billing Portal. Card data never touches our servers, keeping us within PCI SAQ-A scope.
We never see or store your card details.

**8. Security.** We apply technical and organisational measures appropriate to the
sensitivity of the data we hold, including access controls, encryption in transit, and
least-privilege handling of credentials. No system is perfectly secure; we cannot
guarantee absolute security.

**9. Contact & complaints.** Data protection contact: **[LEGAL ENTITY / DPO NAME]**,
privacy@vibe-check-app.com, **[POSTAL ADDRESS]**. EU/UK users may also lodge a complaint
with their local supervisory authority.

---

## E. Factual notes (so your review is grounded in what's true)

- **We genuinely do not store the contents of customer data we read during a scan** —
  only "likelihood assessments" and counts (e.g. "this table appears publicly readable"),
  never the rows themselves. Section 1's wording reflects this; please confirm it reads
  honestly.
- **Card data**: handled entirely by Stripe (hosted Checkout). The PCI SAQ-A claim in
  Section 7 follows from that.
- **The 30-day deletion promise is a claim with operational teeth.** Engineering still
  needs to verify the purge job and the account-deletion cascade actually run as
  described before launch. Worth knowing the policy is making a promise the system must
  keep.
- **Australian supervisory authority**: Section 9 mentions EU/UK supervisory
  authorities. Given the entity is Australian, consider whether it should also point
  Australian users to the **OAIC** (Office of the Australian Information Commissioner).
