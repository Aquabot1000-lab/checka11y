# Agent operating procedure (no Tyler involvement)
1. Acquisition (inbound only, no cold outreach): the free checker page draws search traffic for "website accessibility checker" and "ADA website checker". Agent publishes 1 fix-guide page per week (e.g. "how to fix missing alt text on Wix"). No fear-based claims and no guarantees.
2. Purchase: Stripe Payment Link at $29/mo. The Stripe webhook inserts a row into customers and adds the site to sites.
3. Fulfillment: a weekly cron (Render or Railway) runs scan.js for each site, stores the result in scans, and emails the report through a transactional email free tier (from the product domain, never as Tyler).
4. Support: replies go to the product inbox. Agent answers from FAQ.md. Refund on request in the first 30 days, done automatically in Stripe. Anything legal ("I got a demand letter") gets a stock reply: "we are not lawyers; consult an attorney."
5. Metrics to the ledger each week: visitors, scans, paid customers, MRR, churn, costs.
6. Kill rule: 0 paid customers after 90 days live, or costs above revenue for 2 months.
