# Document 01 — Terms of Service (review)

**Live URL once launched:** `https://vibe-check-app.com/terms`
**Status:** Draft. Contains bracketed placeholders. Needs your sign-off + the blanks filled.

> Read the **00-START-HERE** overview first if you haven't — it explains what the
> product actually does, which you'll need to judge whether these clauses are fair.

---

## A. What this page is for

This is the binding agreement between Vibe-Check and each customer. Its three most
important jobs are:

1. **Push responsibility for authorisation onto the customer** — because we send real
   requests to websites, and scanning a site you don't own can be a crime. (Section 1)
2. **Make clear a passing grade is not a guarantee of security** — so we aren't liable
   if a "Grade A" site is later breached. (Sections 2 & 3)
3. **Cap our financial liability.** (Section 3)

There's also a refund policy (Section 7) written around **Australian Consumer Law**.

---

## B. The questions we'd most like your view on

Please focus here — these are the clauses that actually protect the business:

1. **Section 1 (Authorization to scan).** Is the warranty + indemnity strong enough? A
   customer promises they own/are-authorised-to-test every URL, and agrees to cover our
   legal costs if a scan turns out to be unauthorised. Is this enforceable and
   sufficient under Australian law? Anything missing?

2. **Section 2 (No guarantee of security).** We state — in bold, "AS IS" — that a pass,
   badge, or report is **not** a guarantee the site is secure. Does this wording
   actually shield us from a customer (or a third party relying on the badge) who gets
   breached after we gave them a good grade?

3. **Section 3 (Limitation of liability).** Our liability is capped at the greater of
   (a) fees paid in the last 12 months, or (b) a small fixed sum for free users. Is
   this cap reasonable and enforceable? Are the carve-outs correct?

4. **Section 5 (The badge).** A third party (e.g. a customer's own user) might rely on
   the "Vibe-Checked" badge and then suffer a loss. We try to disclaim liability for
   that reliance. Is that disclaimer effective against someone who isn't our customer
   and never agreed to these Terms?

5. **Section 7 (Refunds) vs. ACL.** We say completed scans are non-refundable but
   preserve all ACL rights. Is the balance right — does it hold up while still being
   commercially sensible?

6. **General:** Anything legally required for an Australian online service that's
   **missing entirely** (e.g. a dispute-resolution clause, a clearer
   consumer-guarantees statement, severability, entire-agreement, assignment)?

---

## C. Placeholders to fill (this page cannot go live until these are real)

| Placeholder in the text | What it needs |
|---|---|
| `[EFFECTIVE DATE]` (top, "Last updated") | The date these Terms take effect. |
| `[LEGAL ENTITY NAME]` (appears 3×) | Exact registered business name. |
| `[SMALL FIXED SUM, e.g. USD 50]` (Section 3) | The free-tier liability cap — confirm amount + currency. |
| `[JURISDICTION]` (Section 9) | Governing law (likely an Australian state). |
| `[VENUE]` (Section 9) | Courts with exclusive jurisdiction. |
| `[POSTAL ADDRESS]` (Section 10) | Registered business postal address. |

> **Linked technical item:** when the effective date is set, a `TERMS_VERSION` value in
> the sign-up flow must be updated to match. Each user's acceptance is recorded against
> that version, so it needs to be the real date, not a placeholder. (Engineering will
> handle the change — you just need to provide the date.)

---

## D. Full current text of the Terms

> The following is the exact copy as it will render on the page (bracketed items are
> the placeholders from section C above).

**Preamble.** These Terms of Service ("Terms") are a binding agreement between you and
**[LEGAL ENTITY NAME]** ("Vibe-Check", "we", "us"), governing your access to and use of
the Vibe-Check website, scanning service, reports, and trust badge (together, the
"Service"). By creating an account or using the Service you agree to these Terms. If you
do not agree, do not use the Service.

**1. Authorization to scan (you are responsible).** Vibe-Check sends network requests
to, and reads data from, the systems you submit for scanning. You are solely
responsible for ensuring you are permitted to do this.

> *(highlighted clause)* You represent and warrant that you own, or are expressly
> authorised by the owner to test, every URL and system you submit for scanning. You
> will not submit any target you are not authorised to test. You agree to indemnify,
> defend, and hold Vibe-Check and its operators harmless against any claim, loss,
> liability, or expense (including reasonable legal fees) arising from scans you
> initiate, including any claim that a scan was unauthorised.

Scanning systems you do not own or are not authorised to test may violate laws
including the U.S. Computer Fraud and Abuse Act (CFAA), the UK Computer Misuse Act, and
equivalents in other jurisdictions. Our ownership-verification step is a control, not a
substitute for your responsibility.

**2. No guarantee of security.**

> *(highlighted clause)* Vibe-Check provides automated security assessments on a
> best-effort, "AS IS" and "AS AVAILABLE" basis. The scans identify a limited set of
> common, automatically-detectable issues. A passing grade, badge, or report does NOT
> guarantee that your site is secure, free of vulnerabilities, or compliant with any
> standard. New vulnerabilities emerge constantly and many classes of issue cannot be
> detected automatically. The reports are informational suggestions to help you improve
> your security; they are not a warranty, certification, or guarantee of safety. You
> remain solely responsible for the security of your systems.

**3. Disclaimers & limitation of liability.** To the maximum extent permitted by law,
Vibe-Check disclaims all implied warranties, including merchantability, fitness for a
particular purpose, and non-infringement.

> *(highlighted clause)* To the maximum extent permitted by law, Vibe-Check is not
> liable for any security incident, breach, data loss, or damage arising from
> vulnerabilities — whether or not they were detected by a scan — or from your reliance
> on any report, grade, or badge. We are not liable for indirect, incidental, special,
> consequential, or punitive damages, including any loss resulting from a vulnerability
> not detected, a false negative, or reliance on a passing grade or badge.

Our total aggregate liability for any claim arising out of or relating to the Service
is limited to the greater of (a) the fees you paid to Vibe-Check in the twelve (12)
months preceding the event giving rise to the claim, or (b) **[SMALL FIXED SUM, e.g.
USD 50]** for free-tier users. Some jurisdictions do not allow certain limitations, so
parts of this section may not apply to you.

**4. Acceptable use.**
- You may not use the Service to scan, probe, or attack any system for which you lack authorisation.
- You may not use the Service as an attack tool against third parties, or to facilitate any unlawful activity.
- You may not attempt to overload, disrupt, reverse-engineer, or circumvent the Service or its scanning limits.
- We reserve the right to refuse, throttle, or terminate any scan — for example targets that resolve to internal, shared, or third-party infrastructure — and to suspend or terminate accounts that we reasonably believe are abusing the Service.

**5. The trust badge.** The Vibe-Check badge reflects the result of a point-in-time,
automated scan only. It is not a certification, audit, or guarantee of security. A badge
may lapse or be revoked (for example when a scan expires or a re-scan changes the
result), and a badged site may still be vulnerable. You may not display a badge in a way
that misrepresents its meaning or implies a guarantee. Third parties who rely on a badge
do so at their own risk, and the limitations in Sections 2 and 3 apply to that reliance.

**6. Service, changes & availability.** The Service is provided on a best-effort basis
and may experience downtime, interruption, or change. We may add, remove, or change
scanning tools, templates, and grading methodology over time; grades are not guaranteed
to be stable across scanner versions. We may modify these Terms; material changes will
be notified, and continued use after changes take effect constitutes acceptance.

**7. Payments & refunds.** Paid plans are billed through Stripe. We never receive or
store your full card details.

Our services come with guarantees under the Australian Consumer Law ("ACL") that cannot
be excluded. You are entitled to a remedy for a major failure of the Service and to have
the Service re-supplied if it fails to be of acceptable quality.

In addition to your ACL rights, our practical policy is:
- **One-off scan (Starter):** if your scan fails to complete or produces no report due
  to a fault on our end, contact us within 14 days and we will re-run the scan at no
  charge or issue a full refund. We do not offer refunds for scans that complete
  successfully — the grade is an automated, point-in-time result and may not match your
  expectations.
- **Monthly subscription (Monitor):** you may cancel at any time. No further charges are
  made after cancellation. We do not offer pro-rata refunds for unused days in a billing
  period, except where the Service was materially unavailable through our fault.

Nothing in these Terms limits or excludes any right or remedy you have under the ACL or
any other applicable consumer protection law.

**8. Termination.** You may stop using the Service and delete your account at any time.
We may suspend or terminate access for breach of these Terms. On account deletion we
handle your data as described in the Privacy Policy.

**9. Governing law.** These Terms are governed by the laws of **[JURISDICTION]**,
without regard to conflict-of-laws rules, and the courts of **[VENUE]** have exclusive
jurisdiction, except where mandatory local law provides otherwise.

**10. Contact.** Questions about these Terms: **[LEGAL ENTITY NAME]**,
legal@vibe-check-app.com, **[POSTAL ADDRESS]**.

---

## E. Factual notes (so your review is grounded in what's true)

- Card payments are handled entirely by **Stripe**; we never see or store card numbers.
  So Section 7's "we never receive or store your full card details" is accurate.
- The refund clause references a **14-day** window for failed one-off scans — confirm
  you're comfortable with that period.
- "We never write to your database or alter application state" is repeated as a product
  promise across the site. One nuance: the scanner **does** send real `POST` requests
  in a couple of checks (e.g. testing whether a login endpoint rate-limits). It does not
  modify data, but it is not purely passive. The copy now says "non-destructive" rather
  than "read-only" to reflect this — please confirm that framing is honest enough.
