# Chrome Web Store submission checklist

Dashboard: https://chrome.google.com/webstore/devconsole

## One-time setup
- [ ] Sign in with the Google account that will own the listing.
- [ ] Pay the one-time developer registration fee (US$5 at the time of writing; check the current fee).
- [ ] Verify your contact email and set the publisher name.

## Package
- [ ] Production build: `pnpm package`, then upload `release/ntm-sentinel-chrome-<version>.zip`.
- [ ] Confirm `manifest.json` has no `localhost` host permissions (`scripts/package.mjs` refuses e2e builds).
- [ ] Bump `apps/extension/package.json` `version` for every new upload. The store rejects a version it has already seen.

## Store listing tab
- [ ] Copy the description, category and language from [LISTING.md](LISTING.md).
- [ ] Upload the 128×128 icon and at least one 1280×800 screenshot.

## Privacy practices tab
- [ ] **Single purpose:** paste from LISTING.md.
- [ ] **Permission justifications:** one per permission.
  - `storage`: Saves the user's settings, per-tab scan results and cached signature lists locally.
  - `activeTab`: Scans the current page only after the user clicks the toolbar icon; no persistent site access is needed.
  - `scripting`: Injects the extension's bundled (non-remote) analysis script into the page the user asked to scan.
  - `sidePanel`: Displays the main dashboard in the browser side panel.
  - `cookies` (optional): Shows cookie names and security attributes for the scanned site; values are discarded and never stored or transmitted.
  - `webNavigation` (optional): Shows the redirect chain that led to the current page; kept in session memory per tab only.
  - Host permissions (optional): Lets users grant persistent scanning on a site (or all sites) instead of clicking the icon each time; required for auto-scan and the opt-in fingerprinting monitor.
- [ ] **Remote code:** answer **"No, I am not using remote code."** All JavaScript is bundled; the CSP is `script-src 'self'`.
- [ ] **Data usage:** for this build (no backend configured), tick **none** of the data categories, because nothing is collected or transmitted. If a later build enables cloud reputation, declare **"Web history"** (hostnames sent on explicit user request) and update the privacy policy.
- [ ] Tick all three certifications (no selling data, no unrelated use, no creditworthiness use).
- [ ] **Privacy policy URL:** a public URL hosting [PRIVACY.md](../PRIVACY.md).

## Distribution
- [ ] Visibility: Public, or Unlisted for a soft launch.
- [ ] Regions: all.

## Submit
- [ ] Click **Submit for review**. Expect broad host permissions (even optional ones) to lengthen the review. The justifications above address this.
- [ ] After approval, add the store URL to README.md.
