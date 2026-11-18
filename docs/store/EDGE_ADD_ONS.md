# Microsoft Edge Add-ons submission checklist

Dashboard: https://partner.microsoft.com/dashboard/microsoftedge

## One-time setup
- [ ] Register for the Microsoft Edge program in Partner Center. Registration is free; check the current terms.
- [ ] Complete the publisher profile and contact information.

## Package
- [ ] Production build: `pnpm package`, then upload `release/ntm-sentinel-edge-<version>.zip`.
- [ ] Edge validates the manifest on upload. Fix any errors it reports before continuing.
- [ ] Bump the version for every new submission.

## Availability
- [ ] Visibility: Public, or Hidden for a soft launch.
- [ ] Markets: all.

## Properties
- [ ] Category: **Developer tools**.
- [ ] **Privacy policy:** required, because the extension handles website data. Provide a public URL hosting [PRIVACY.md](../PRIVACY.md).
- [ ] Website / support URL: a public project page or contact page. The GitHub repo is private, so it can't be used here.
- [ ] Mature content: No.

## Store listings (English)
- [ ] Description and short description: from [LISTING.md](LISTING.md).
- [ ] Store logo: 300×300 PNG.
- [ ] Screenshots: 1280×800 or 640×480, up to 10.
- [ ] Search terms: security, privacy, tracker, technology detector, wappalyzer alternative, css inspector, color picker, api debugger, devtools, phishing.

## Notes for certification (recommended)
Paste this text:
> NTM Sentinel requests no host access at install. To test: open any https website, click the toolbar icon (activeTab), and results appear in the popup. Click "Open full dashboard" for the side panel. The DevTools panel is "NTM APIWatch" (F12). Optional permissions (cookies, webNavigation, site access) can be granted under Settings → Permissions. No account or backend is needed; nothing is transmitted off-device in this build.

## Differences from Chrome to keep in mind
- Edge review is separate, and its turnaround can differ from Chrome's.
- Edge asks for a 300×300 logo and 640×480 or 1280×800 screenshots; Chrome's sizes differ.
- Edge has no "single purpose" or "remote code" questionnaire like Chrome's, but certification checks the same policies.

## Submit
- [ ] **Publish**, then track certification status in Partner Center.
