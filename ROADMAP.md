# Roadmap

Honest inventory of the desktop app and its landing page. **Shipped** means implemented and covered by an automated test or a screenshot of the built app. **Partial** means implemented with a named gap. Nothing here has been verified against a live AWS account.

## Deploying

- [x] Shipped: AWS CLI profile discovery and per-profile region
- [x] Shipped: browser sign-in through AWS CLI v2.22+, identity verification, window returns to the front
- [x] Shipped: Dockerfile inspection (single exposed TCP port) and strict single-service Compose inspection with every unsupported feature listed
- [x] Shipped: wizard with draft save and restore (secret values are never saved)
- [x] Shipped: deployment through the backend with operation IDs, stage events, cancel, and a recorded result
- [ ] Partial: failure screen shows the backend code, stage, remediation and whether resources may exist; it does not yet list what is still serving in AWS
- [ ] Not started: multi-service Compose, volumes, Compose secrets and Secrets Manager references
- [ ] Not started: adjustable task size, custom-domain HTTPS from the app, deleting a deployment, automatic updates from a repository
- [ ] Not started: live status of past deployments (the list shows the result recorded when each finished)

## Setup

- [x] Shipped: first-run setup with prerequisite checks and profile selection
- [x] Shipped: one-click installer for AWS CLI v2 and Docker Desktop on Windows: Windows Package Manager first, then the publisher's signed installer with Authenticode verification, silent install, retries, WSL repair, PATH refresh, Docker start; never opens a download page; reports a declined Windows prompt or a blocking policy exactly
- [ ] Partial: installer logic is tested with stand-in commands; it has not yet run against a clean Windows machine

## Interface

- [x] Shipped: frameless window with working title-bar controls, navigation rail that becomes a bottom bar on narrow windows
- [x] Shipped: light, dark and system themes, accent colour with hex, rgb(), hsl() and name input, rainbow accent, reduce motion, calm and focus modes
- [x] Shipped: English, Cantonese and bilingual language modes (navigation, headings, actions and status), funny level 1 to 5 that changes wording only
- [x] Shipped: personal wording JSON by file picker or drop anywhere, validated whole, applied whole, cleared in one action
- [x] Shipped: school mode hides playful extras; dim sum surprise at 10% per launch after the first runs, not during setup; its switch cannot turn it off and says so
- [x] Shipped: narration with installed voices, action sounds, notifications list, toasts with a live region
- [x] Shipped: command palette on Ctrl+Shift+F with a regex mode that explains each token, settings search, keyboard shortcuts
- [x] Shipped: app rename with reset, scheduled light and dark theme, local settings history with export
- [ ] Partial: Cantonese covers the main labels; some longer explanatory text is English in every mode
- [ ] Partial: dim sum surprise reads the public catalog; a photo shows only when the catalog record carries a public image address
- [ ] Not started: per-element appearance editor, tabs, context menus, live charts, logo customization, local version history with undo, changelog viewer, offline documentation

## Release and site

- [x] Shipped: every push to main tests, builds the Windows installer, captures screenshots on a Windows runner, and publishes a tagged release with workflow time and line count
- [x] Shipped: landing page source with vendored fonts and a link preview image
- [ ] Waiting on the repository owner: enable GitHub Pages with GitHub Actions as the source so the landing page workflow can publish
- [ ] Not started: code signing, Squirrel installer, automatic updates inside the app, dim sum release code names, original app icon
