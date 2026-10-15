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
