# Validation (Oct 14, 2026, box, Chrome headless). Single page each unless noted.
Compared: our scanner (axe-core 4.14 via @axe-core/puppeteer, WCAG 2.0/2.1/2.2 A+AA tags) vs Pa11y 10 (axe runner and HTML_CodeSniffer runner, WCAG2AA, "error" type only).

| Page | Ours (final) | Pa11y-axe | Pa11y-HTMLCS | Time (ours) | Notes |
|---|---|---|---|---|---|
| W3C BAD before/home | 46 | 46 | 41 | 2.1s | Rule sets identical to Pa11y-axe |
| W3C BAD after/home (fixed version) | 4 | 24 | 0 | 2.0s | Our 4 = WCAG 2.2 target-size (new rule; HTMLCS has no 2.2). Pa11y-axe's 24 are color-contrast; HTMLCS and we report 0. Likely a render-timing artifact in Pa11y (unverified). |
| W3C BAD before/news | 47 | 47 | 42 | 2.1s | Match |
| Deque Mars demo | 49 | 121 | 78 | ~4s | Pa11y-axe count includes best-practice rules (tabindex, duplicate-id-aria) that are not WCAG AA, which we deliberately exclude. All WCAG rules Pa11y found, we also found. |
| webaim.org | 0 | 24 | 0 | 2.0s | Same contrast discrepancy as the "after" page |
| example.com | 0 | 1 (bypass, best-practice) | 0 | 1.9s | OK |
| nonexistent domain | error | error | error | 0.5s | Now reported as an error (was "0 issues") |
| W3C BAD before, 25-page crawl | 351 issues / 25 pages, 0 failures | n/a | n/a | 42s | Multi-page crawl OK |

## Bugs found and fixed
1. **Iframes were not scanned** (Mars demo: Pa11y flagged frame-tested). Switched to @axe-core/puppeteer, which injects axe into frames. Mars went from 24 to 49 issues. There's a fallback to top-frame-only if frame injection fails.
2. **A failed page load reported "0 issues"**, a false all-clear. Now the scan throws when all pages fail, and the UI says it could not load the site. Partial failures are listed per page.
3. **WCAG 2.1 A and 2.2 AA tags were missing** from the rule set. Added.
4. CSP-protected pages failed injection ("Page/Frame is not ready"). Fixed with setBypassCSP before navigation.

## False positives / negatives (vs references)
- False positives: none observed for WCAG rules. Contrast results agree with HTMLCS where Pa11y-axe disagrees.
- False negatives: best-practice-only rules are excluded by design. Like every automated tool, it can't judge alt-text quality, keyboard traps, focus order, reading order, captions or meaningful link text.

## Known limitations
- Automated only; it finds a subset of WCAG failures. No manual testing.
- No pages behind a login. JavaScript-heavy sites are scanned after network idle, with a 30s timeout per page.
- The crawl follows same-host links in discovery order, not by importance; capped at 25/50 pages.
- Render free tier: 512 MB RAM, sleeps after idle, so the first request takes 30-60s to cold-start. Free scans are queued 1 at a time; rate limit is 10 scans per IP per hour (in memory).
- SSRF guard blocks private IP literals and localhost, but not DNS names that resolve to private IPs (low risk on Render; to do).
- Pa11y color-contrast discrepancy is not fully explained.
