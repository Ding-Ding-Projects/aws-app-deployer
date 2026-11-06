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

- [x] Shipped: first-run setup with prerequisite checks that name the exact reason (not on PATH, timed out, too old, failed to run) and profile selection
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
- [x] Shipped: dim sum surprise shows the dish name in both languages with its published catalog photo; the photo list is cached in application data for a day and photos are never copied
- [x] Shipped: a context menu on every element (right-click, Shift+F10 or the menu key) with a filter field, its own regex builder with token explanations, target-specific actions, and shortcuts shown from the same registry that binds them
- [x] Shipped: two-key super confirmation for destructive actions: both keys (click or R and M), then a full-range slider, Emergency exit and Escape, focus returned
- [x] Shipped: accessibility tools in the title bar: text size, high contrast, reduce motion, always-visible focus, larger targets, keyboard help (F1), read the screen aloud, a confirmed hide action with Cancel focused, and reset; reachable from Settings search and the palette when hidden
- [x] Shipped: an info button above every setting control with what it does, where the value came from (your settings file or the named built-in default), guided steps and a practice control that never changes the real setting; a test fails if a setting has no explanation
- [x] Shipped: notification centre with search, regex, select all shown, invert, bulk copy and dismiss; errors stay until dismissed
- [x] Shipped: deployment records with collapsible filter (search, regex, status), multi-select, invert, bulk export and bulk removal through super confirmation
- [x] Shipped: anchored panels that drag by their header, resize from the corner, move with Alt+Arrows (Shift resizes), and remember size and position per panel with a reset
- [x] Shipped: tabs: one Workspace tab, utility tabs only from the New tab catalog (search with regex), reselect focuses, close and close others from the tab's context menu
- [x] Shipped: local history: every settings change and record removal kept append-only beside app data, category filters with counts, regex search, date range, before and after view, restore as a new revision, labels, export
- [x] Shipped: changelog viewer built from release tags at build time: version, date, Added, Changed, Fixed, Removed, full commit SHA linking to GitHub, date and regex filters, copy and export
- [x] Shipped: offline docs: one article per feature bundled into the app, rendered by one safe Markdown renderer, searchable with regex; a test fails if an article is missing or links to a missing one
- [x] Shipped: export of records, history and settings as JSON, YAML, CSV or Markdown, or everything as a ZIP, each stating schema, UTF-8 and LF, and any loss before saving
- [ ] Partial: 7z archives and encrypted archives are not offered yet (ZIP only)
- [x] Shipped: toy element locks from the context menu (Lock this element…), six policies (PIN, password, PIN plus password, password plus TOTP, PIN plus TOTP, all three), on-screen keypad, QR code for authenticator apps, scrypt hashes and an encrypted vault in the operating system's protected storage, 5 free tries then a doubling wait capped at one hour. Just for fun, never security: deleting the app data folder removes every lock
- [x] Shipped: unlock ladder while waiting (dim sum quiz, ten sums, whack-a-mole, the clock), up to three ladders an hour; each rung clears a quarter of the wait and never reveals or resets the credential
- [x] Shipped: Support Tickets, a local joke help desk that always resolves to the app data folder and states that nothing is sent anywhere
- [x] Shipped: per-element appearance editor from the context menu: rest, hover, focus and pressed states; font, size, weight, italic, underline, strikethrough, capitals, letter spacing, text, background and border colours, radius, glow, opacity; per-property, per-element and global reset; undo and redo; copy and paste style; presets; validated JSON export and import
- [x] Shipped: live deployment charts (time per deployment, outcomes per day) from local records, with a table view
- [x] Shipped: logo customization (symbol, shape, colour, or a checked PNG, JPEG or WebP)
- [x] Shipped: Tools tab with a Base64 toolkit and a bounded local file converter (JSON, CSV, YAML output, Markdown, PNG, JPEG, WebP); missing tools are named on disabled rows
- [x] Shipped: open results in VS Code (when installed) or the default app
- [x] Shipped: per-language voices with pitch and speed, and a wording-drop celebration with a quiet path
- [ ] Not started: YAML input, video and audio conversion, 7z

## Release and site

- [x] Shipped: every push to main tests, builds the Windows installer, captures screenshots on a Windows runner, and publishes a tagged release with workflow time and line count
- [x] Shipped: landing page with vendored fonts and a link preview image, published by GitHub Pages at https://ding-ding-projects.github.io/aws-app-deployer/
- [x] Shipped: original app icon from `assets/icon.svg`, generated into a multi-size `.ico` and wired into the window, executable and installer
- [x] Shipped: Squirrel.Windows installer (`Setup.exe`, `RELEASES`, full `.nupkg`), unsigned and labelled as such in release notes and the update banner
- [x] Shipped: automatic updates for installed copies: checks at start and every 4 hours, ready banner with version, release notes, unsigned warning, Restart to install update and Later, manual Check for updates, visible failure state
- [x] Shipped: version, dim sum code name and build time (with seconds and time zone) from a build stamp on the first screen; honest unavailable state for unstamped builds
- [x] Shipped: dim sum code names from published catalog photos, used once per project, named in release notes and About; a release never waits on the catalog
- [ ] Partial: delta packages are not generated yet (full packages only)
- [ ] Not planned: code signing (builds stay unsigned by policy)
