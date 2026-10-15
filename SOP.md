# Operating SOP (agent-run)
Live: https://checka11y-scan.onrender.com · Render srv-db81vegn74is73dfl9bg · Supabase nhqwobxwqudyiboodzef · repo github.com/Aquabot1000-lab/checka11y
Secrets: /workspace/profit/.a11y.env (box only, chmod 600). Never commit.
## Daily (agent)
- Check /admin/metrics?t=ADMIN_TOKEN and error_log (Supabase). Investigate errors_24h > 0.
- Update /workspace/profit/ledger.md from metrics (MRR, refunds, costs = $0).
## Weekly
- GitHub Actions cron (Mon 09:00 UTC) POSTs /internal/weekly. Server re-scans monitored sites not scanned in 6 days, diffs issue fingerprints (page path + rule) vs the last scan, and emails new/resolved counts + cancel link.
- Publish 1-2 new fix guides (see ACQUISITION.md).
## Billing (after Stripe key)
- On boot, with STRIPE_SECRET_KEY set, the app creates (only) products/prices tagged metadata.project=a11yscan, with lookup_keys a11yscan_{plan}_monthly, plus payment links. Copy the logged links into the LINK_SOLO/LINK_STUDIO/LINK_AGENCY/LINK_AGENCYPLUS env vars so restarts don't create duplicates.
- Webhook endpoint: /stripe/webhook (events: checkout.session.completed, customer.subscription.deleted, charge.refunded). It only acts on objects with metadata project=a11yscan. Needs STRIPE_WEBHOOK_SECRET.
- Never list, edit or delete any non-a11yscan Stripe object.
## Support
- FAQ answers: scan failed (public pages only, 30s load); cancel (link in every email, or /cancel?token=); refund within 30 days of first charge, no questions asked (issue it in Stripe; the charge.refunded webhook records it); legal question or demand letter: "We can't give legal advice. Please consult an attorney." Never claim compliance or protection.
- Escalate to Tyler only for chargebacks/disputes, legal threats, or anything needing his identity.
## Kill / scale rules
- Kill: 0 paid after 90 days live with at least 500 free scans, OR any costs with revenue below costs for 2 months.
- Scale: >=5 paid and churn <10%/mo: build white-label logos and programmatic guides.
## Free-tier sleep/pause (decision: no keep-alive pinging)
- Render free web services spin down after 15 min idle, and Render limits free instance hours per workspace each month. A keep-alive pinger would burn the shared free hours the OverAssessed workspace may also use, and it works against the purpose of the free tier. NOT done. The cost is a 30-60s cold start for the first visitor. Fix when revenue allows: Render Starter (owner spend approval).
- Supabase free projects pause after about 1 week of inactivity. Real app traffic (scans and events write to the DB) counts as activity. No artificial pings. If it pauses, restore with the Supabase restore_project tool, which is free.
- The weekly GitHub Actions trigger is a real product job (weekly monitoring), not a keep-alive.
## SSRF guard
- netguard.js resolves DNS and blocks private, loopback, link-local, CGNAT, metadata and multicast ranges on every browser request, including redirects and subresources. Locally tested: 127.0.0.1, [::1], 169.254.169.254, a localtest.me name and an httpbin redirect to 127.0.0.1 were all blocked.
## Oct 14, 2026 8:00 PM CT status
- Name: Welcome Check Web CONFLICTS with Checka11y.css (an existing open-source a11y tool; checka11y.com registered). ScanAccessible conflicts with Scan Accessibility / ScanAccess. Chosen: **AccessWren**. accesswren.com unregistered (Verisign RDAP 404). Web search found no software/accessibility company using the name. USPTO not checked; the search system needs a browser session (to do before spending on brand).
- Domain price: Cloudflare Registrar $10.46/yr (register = renew); Porkbun $11.08/yr.
- Stripe: STRIPE_SECRET_KEY in env starts with mk_, which is the key ID, not the secret. The API returned 401. Nothing created.
- STRIPE_WEBHOOK_SECRET in env is only 10 chars (real ones are ~38) and likely a placeholder. Set on Render anyway; replace it.
- SENDGRID_API_KEY in env is 32 chars without the SG. prefix; the API returned 401/403. Likely also a key ID. Not set on Render. SendGrid code is wired (needs SENDGRID_API_KEY + MAIL_FROM).
