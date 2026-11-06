# Feature audit

Audit updated 2026-11-06. Original baseline: `7b9e68e9d39aa012ed2958b2515f70b4c9fbf6d8`; desktop release delta: `9161b65a85c061f06d66c53542fbb038d0417ff5` (`origin/main` inspected locally). Browser companion evidence refers to the current integration worktree, whose merge/rebase and final source binding remain pending. This reconciles all 115 stable catalogue identifiers. Identifiers are retained verbatim for traceability; descriptions use public product terminology. No private source links, private requirements text, personal mappings or credentials are included.

**The application is not feature complete.** This document is an evidence-based gap audit, not a release acceptance certificate or a substitute for a per-surface proof inventory. A source implementation alone does not establish shipped compliance.

Status meanings: **Partial** means some implementation exists with named gaps; **Missing** means no required implementation/proof was found in the inspected baseline; **Unverified** means external state or acceptance evidence was not checked; **Not applicable** states a concrete scope reason; **Suspended** identifies an explicitly dormant requirement. No row is labeled fully implemented because the complete documentation, localization, persistence, focused tests, negative regression, packaged interaction and genuine capture proof was not established.

Evidence namespaces: **Baseline** means the original commit; **Desktop delta** means `9161b65`; **Browser delta** means the unfinalized browser integration. Rows without a delta label retain baseline findings. Concurrent changes are not credited as accepted delivery. Main sources inspected: `src/renderer/app.js`, `src/renderer/lib.js`, `src/main/{main,bridge,store,installer}.js`, `package.json`, `tests/main/main.test.js`, `tests/renderer/lib.test.js`, `ROADMAP.md`, `README.md`, `.github/workflows/release.yml`, `site/index.html` and the recursive repository tree. Tests were inspected, not executed for this audit. Runtime AWS acceptance, clean Windows installation and external project services were not verified.

## Identifier reconciliation

| Identifier | Status | Scope / applicability | Baseline evidence and remaining work |
| --- | --- | --- | --- |
| `job-experience-document-label` | Not applicable | App | This AWS deployment application has no job-document workflow. |
| `language` | Partial | App/site | src/renderer/lib.js provides three modes; app.js and site/index.html retain English-only explanatory copy. |
| `funny-emoji` | Partial | App/site | src/main/store.js has one funnyLevel defaulting to 3; independent language sliders defaulting to 5 are missing. lib.js varies only success/failure copy. |
| `personal-vocabulary` | Partial | App/site | app.js picker and lib.js parser exist; parser caps 500 entries and 64-character keys/values. Full required bounds and site control are missing. |
| `vocabulary-drop-apply` | Partial | App | app.js handles document drops, but lacks the named full-window celebration, timed stages and dedicated outcome sound proof. |
| `school-mode` | Partial | App/site | store.js saves a local boolean; shared propagation, rename, credential-gated exit and complete suppression are missing. |
| `narration` | Partial | App/site | app.js uses one voice and cancels current speech. Separate language tracks, pitch, serialized queue and screen-reader yielding are missing. |
| `action-sound-effects` | Partial | App | app.js provides cues and a persisted switch; documented cue provenance, quiet hours, volume and installed-app proof are missing. |
| `scheduled-settings` | Partial | App/site | store.js/lib.js schedule light/dark theme only; other settings, external API and Home Assistant sources are missing. |
| `display-name` | Partial | App | app.js/store.js support rename/reset and history entries. Full identity-path, About/notification coverage and protected mutation-history proof remain missing. |
| `adhd-modes` | Partial | App/site | store.js exposes focus/calm only; five independent required modes and site equivalents are missing. |
| `dim-sum` | Partial | App/site | Desktop delta: bridge.js resolves public published photos and metadata. Launch gating exists; all excluded-state/runtime acceptance and site equivalent remain unproven. |
| `dim-sum-photo-source` | Partial | App/site/repository | Desktop delta: bridge.js enumerates public catalog-v1 release assets and caches metadata. Full cache provenance, unavailable-image reporting and built/runtime acceptance remain unverified. |
| `material-design` | Partial | App/site | tokens.css and app.css implement a Material-inspired interface; no complete primitive conformance audit or built evidence. |
| `workflow-navigation` | Partial | App | app.js provides real workflow navigation and window controls; complete per-control interaction acceptance is unverified. |
| `motion` | Partial | App/site | app.css and applyAppearance provide animation/reduced motion; complete per-interaction motion and interruption evidence missing. |
| `live-charts` | Missing | App/site | ROADMAP.md explicitly lists live charts as not started; no chart implementation in baseline source. |
| `appearance-editor` | Missing | App/site | ROADMAP.md explicitly lists per-element appearance editing as not started. |
| `color-picker` | Partial | App/site | lib.js supports a limited name/HEX/RGB/HSL subset; alpha, extended spaces, gamut/contrast and full picker are missing. |
| `logo-customization` | Missing | App/site | ROADMAP.md explicitly lists logo customization as not started. |
| `overlay-panels` | Partial | App/site | app.js has palette/drawer overlays; persistent resize, drag, keyboard geometry controls and full overflow matrix missing. |
| `collapse-filters` | Missing | App/site | Settings search is continuously displayed; no persisted collapsible search/filter/statistics system found. |
| `accessibility-sizing` | Partial | App/site | Accessible labels/live regions and narrow CSS exist; full tools menu, screen-reader acceptance and 100–200% scale matrix missing. |
| `functional-ui` | Partial | App/site/browser | Real desktop operations and empty states exist; Browser delta adds key/sign-out, upload/sample, AWS authorization and scoped transport. Site illustration labeling and full interaction acceptance remain incomplete. |
| `onboarding-wizard` | Partial | App/browser | Baseline real desktop setup; Browser delta adds protected key intake and AWS-console remote-code flow. Clean-machine desktop and real-account browser acceptance remain unverified. |
| `tabs` | Missing | App/site | ROADMAP.md explicitly lists tabs as not started; rail navigation is not browser-style tab support. |
| `regex-search` | Partial | App/site | lib.js explains tokens around synchronous RegExp; full workbench, safe execution bounds and every-search builder missing. |
| `command-palette` | Partial | App/site | app.js binds Ctrl+Shift+F to ten commands; complete settings/articles/rich controls and exact-element teleport missing. |
| `context-menus` | Missing | App/site | ROADMAP.md explicitly lists context menus as not started. |
| `menu-shortcuts` | Missing | App/site | Global shortcuts exist, but no context-menu command/binding display system exists. |
| `rich-controls` | Partial | App/site | Settings have controls, but palette results and other values lack shared rich-control bindings and coverage inventory. |
| `guided-forms` | Partial | App/site | Deployment wizard offers source/configuration/review; every-element guidance, complexity inventory and textbox clear controls missing. |
| `info-icon-guidance` | Missing | App/site | No complete per-control info-button implementation or coverage inventory in baseline renderer. |
| `settings-explanations` | Partial | App/site | app.js provides descriptions for some settings; compiled-default/file provenance and hand-written coverage guard missing. |
| `blank-editors` | Missing | App/site | Required editor/preset/history system is absent; conditional applicability must be recorded per future editor. |
| `super-confirmation` | Missing | App/site | No two-key/slider confirmation implementation; destructive/reset flows need explicit review. |
| `element-locks` | Missing | App/site | No per-element vault-backed lock or credential wizard in baseline renderer/main code. |
| `support-tickets` | Missing | App/site | No local recovery desk, ticket list or platform-folder recovery routes. |
| `unlock-ladder` | Missing | App/site | Required lock capability is absent, along with challenge ladder and attempt-budget proof. |
| `authenticator` | Missing | App/site | No local TOTP destination, vault integration or RFC-vector tests. |
| `qr-pairing` | Missing | App/site | No in-process pairing QR and code-confirmation flow. |
| `honest-monetization` | Unverified | App/site | README/site describe the app as free; no paid flow found. Full protected-category and no-nag interaction audit pending. |
| `local-history` | Partial | App/site | store.js keeps capped JSON history, not append-only Git-backed revisions, restore/diff/undo or protected mutation history. |
| `exports` | Partial | App/site | main.js exports history JSON only; full data/view/settings export, format selection, re-import and archive support missing. |
| `bulk-actions` | Missing | App/site | No multi-select, scoped select-all, inverse selection or batch review/progress implementation. |
| `changelog` | Missing | App/site | ROADMAP.md explicitly lists changelog viewer as not started. |
| `offline-docs` | Missing | App | ROADMAP.md explicitly lists offline documentation as not started; no article bundle tree. |
| `rendered-provider-text` | Missing | App/site | No shared sandboxed Markdown renderer for articles/provider text. |
| `notifications` | Partial | App/site | app.js keeps 50 in-memory notes and auto-removes all toasts after 4.2 seconds, including errors; search/bulk/persistent warnings missing. |
| `file-converter` | Missing | App/site | No converter UI, adapter catalogue, sandbox or bundled conversion tools in baseline tree. |
| `base64-tools` | Missing | App/site | No Base64 text/file toolkit or streaming/history implementation. |
| `minecraft-server-manager` | Missing | App | No server creator/manager or local/SSH target adapters. Broad required tool remains outstanding. |
| `minecraft-world-generator` | Missing | App | No version-bound world generator, canvas, EULA or verified output workflow. |
| `ollama-suite` | Missing | App/site | No managed installer, model store, hardware-fit, chat or rollback UI. |
| `external-editor` | Missing | App | No editor detection, preference or export-to-editor route. |
| `download-handoff` | Not applicable | Extension integration | No browser-extension download capture is provided. Reassess if that integration is added. |
| `forge-publishing` | Not applicable | App | The app deploys containers to AWS and does not publish repositories to a forge. |
| `progress-recovery` | Partial | App/site/browser | Baseline bridge scopes progress/cancellation; Browser delta adds remote-login codes, denied/expired/cancel states and session cleanup guards. Surviving-resource recovery and real-account end-to-end acceptance remain incomplete. |
| `drawesome-drawing` | Missing | App | No drawing/annotation surface, tools, history or SVG/PNG exports. |
| `completeness-parity` | Missing | App/site/repository | This audit is discovery, not a proof inventory. Baseline lacks per-surface implementation/docs/localization/test/interaction/capture bindings and omission guard. |
| `front-provenance` | Partial | App/site/browser | Desktop delta: scripts/stamp-build.mjs writes build-info.json; main.js/preload/app.js expose version, built time, timezone and unavailable state. Packaged provenance binding/negative regression and site/browser equivalents not fully verified. |
| `product-evidence` | Partial | App/site/repository | Browser delta adds docs/evidence/browser-check.json and desktop/mobile captures. These establish only recorded browser checks, not live AWS/installed Windows acceptance. Desktop delta workflow still screenshots source through npx electron. |
| `screen-recording` | Missing | App/repository | No committed product recording or source-bound capture manifest in baseline tree. |
| `design-reference-parity` | Missing | App/site | design/artboards exists, but complete matched capture tuples, comparisons, diffs and omission regression are missing. |
| `design-folder` | Partial | Repository | Desktop delta retains design/ artboards/canvas/handoffs and adds Updates references; complete process validation and reference/product comparison proof remain unestablished. |
| `cheap-jor-matrix` | Missing | App/site | No complete per-surface language/theme/scale/viewport interaction and clipping matrix in baseline tree. |
| `public-huishot-gallery` | Unverified | External evidence | No verified public gallery link/provenance inventory found; external gallery state not queried. |
| `landing-site` | Partial | Site | site/index.html and Pages workflow exist; full independent required features and documentation missing. |
| `deen-wah-site` | Partial | Site | site/index.html includes narrow-layout CSS; phone interaction, localization and accessibility acceptance unverified. |
| `installer-download-button` | Partial | Site | Home links releases/latest rather than a verified direct installer asset and availability state. |
| `feature-articles` | Missing | Site | No per-feature article routes, localized articles or suggested-article footer tree. |
| `vendored-fonts` | Partial | App/site/repository | Font binaries/licenses exist; reproducible acquisition script, digest manifest and built-font checks missing. |
| `shared-link-embed` | Partial | Site/repository | site/og.png and basic metadata exist; root social-preview.png, complete tags and byte-identical/public-fetch proof missing. |
| `homepage-link` | Unverified | Site/repository | README links the Pages URL; repository homepage field, deployed response and base-path proof not checked. |
| `vocabulary-unlock-boundary` | Unverified | App/site | No private vocabulary is shipped in baseline reviewed copy; full unauthenticated asset/route leak and authenticated rendering tests missing. |
| `private-day-teet-hui-app` | Not applicable | Repository | This is a public repository with a public Pages site, not private-site packaged delivery. |
| `status-hub` | Missing | App/site/repository | No shipped status destination or registration/evidence binding found; external registration remains unverified. |
| `discord-status-bridge` | Not applicable | Shared status service | Bridge implementation belongs to the shared status service, not this AWS application. |
| `panic-webhooks` | Not applicable | Shared status service | Dispatch belongs to the shared status service; this repository is not that service. |
| `tidbyt-displays` | Suspended | Shared status service | Display delivery requirement is suspended; absent frames are not a completion blocker. |
| `build-entrypoints` | Missing | Repository | Root build.bat/build-installer.bat and dedicated build GUI absent; package scripts are not substitutes. |
| `fresh-build-run-command` | Missing | Repository | README requires npm ci/npm start; no verified fresh-machine build-and-run command or source-bound receipt. |
| `dependency-fetcher` | Missing | Repository | No root download-dependencies.bat, pinned digest manifest or shared bootstrap entrypoint. |
| `bundled-dependencies` | Partial | App | Electron packaging exists; AWS/Docker use external installation and no installed-artifact bundled-first resolution proof. |
| `squirrel-installer` | Partial | App/repository | Desktop delta: package.json now selects Squirrel.Windows; release.yml collects dist/squirrel-windows/* and discloses unsigned builds. Successful release assets, Setup/RELEASES/nupkg integrity, clean install/update/uninstall and runtime acceptance are unverified. |
| `self-signing` | Unverified | Repository | Desktop delta release notes explicitly disclose unsigned Windows builds. No required-format signing need established; actual assets and absence of signing-service/key leakage remain unverified. |
| `auto-updates` | Partial | App | Desktop delta: src/main/updater.js supplies startup/four-hour checks, Squirrel feed and download/ready/error events; renderer adds banner, Later, notes and restart. Real installed update/hash-failure/rollback/unsaved-work acceptance and localization remain incomplete. |
| `app-icon` | Partial | App/repository | Desktop delta: assets/icon.svg, scripts/build-icons.mjs, build/icon.ico/png and renderer icon are wired to package/window. Packaged executable/installer/update small-size inspection remains unverified. |
| `release-workflow` | Partial | Repository | Desktop delta workflow builds Squirrel and stamps provenance/code names on main push/manual dispatch, but test job still gates release contrary to required ungated policy. Final run, packaged assets and download acceptance not verified here. |
| `release-timing` | Partial | Repository | Desktop delta release.yml adds start/finished UTC values, but measures before publication and lacks required separate completed/duration HH:mm:ss lines through final publication. |
| `release-line-counts` | Partial | Repository | release.yml concatenates files through wc; no dedicated categorized/nonblank/attribution counter or published-release README binding. |
| `release-dim-sum-photo` | Partial | Repository | Desktop delta scripts/code-name.mjs resolves published catalog-v1 assets; workflow emits bilingual photo link or version-only reason. Actual published notes, source binding and complete non-reuse acceptance unverified. |
| `dim-sum-code-names` | Partial | App/site/repository | Desktop delta selects unused public-photo-backed names from release history and stamps About/front provenance. Real release mapping, pagination completeness, changelog and site release coverage remain unverified/incomplete. |
| `ci-bootstrap` | Partial | Repository | Workflows use setup-node/npm ci; complete job dependency inventories, cold-cache proof and always-upload safe outputs missing. |
| `runner-selection` | Unverified | Repository | Workflows use ubuntu-latest/windows-latest; no recorded live runner-capacity inspection or pinned fallback image. |
| `encrypted-public-builder` | Not applicable | Repository | Private-repository encrypted publishing does not apply to this public repository. |
| `tabbed-readme` | Partial | Repository | README has summary/install/site links, but long reference folding and CONTRIBUTING/LICENSE/SECURITY/CODE_OF_CONDUCT files absent. |
| `human-time-estimate` | Missing | Repository | README has no method-linked human implementation estimate beside release-derived line counts. |
| `sanitized-instruction-copy` | Missing | Repository | No clearly labeled sanitized instruction mirror in README/AGENTS at baseline. |
| `agents-md-vocabulary-block` | Missing | Repository | AGENTS.md absent at baseline; required sanitized discipline block not present. |
| `vocabulary-hash-lock` | Missing | Repository | No check-vocabulary script/build integration/pre-push hook present at baseline. |
| `roadmap-checklist` | Partial | Repository | ROADMAP.md uses real checkboxes and candid gaps, but shipped definition accepts test OR screenshot rather than complete proof. |
| `feature-docs` | Partial | Repository | Browser delta adds docs/BROWSER-PREVIEW.md and this audit. Categorized per-feature articles, category indexes and complete coverage remain missing. |
| `postman-collections` | Missing | Repository/browser | Browser delta adds session/events/upload/RPC HTTP routes, but no master/category Postman collection or complete API documentation inventory. |
| `wiki-day-teet-hui-sync` | Unverified | Repository/site | Site source exists; wiki contents and same-task synchronization evidence not checked. |
| `handoff-record` | Partial | Repository/external records | HANDOFF.md exists; matching hosted handoff record, exact current evidence and owner transition verification pending. |
| `closeout-prompt` | Missing | Repository | CLOSEOUT_PROMPT.md absent at baseline; publication/ref proof not part of this audit. |
| `discussion-records` | Unverified | External records | Discussion coverage, deduplication, rolling progress and release announcement/pin state not queried. |
| `project-board` | Unverified | External records | Repository-linked project and task state not queried. |
| `operational-skill` | Unverified | Operational evidence | Browser delta documents container/tunnel/login/recovery routes in docs/BROWSER-PREVIEW.md; installed operational-skill validation and complete acceptance evidence not established. |
| `readme-prompt-banner` | Not applicable | Catalogue infrastructure | Applies only to the instruction catalogue repository, not this application. |
| `uh-single-file-editions` | Not applicable | Catalogue infrastructure | Applies only to portable instruction-catalogue editions, not this application. |
| `project-profile` | Not applicable | Catalogue infrastructure | Applies to catalogue-owned project memory records, not a public app feature. |
| `roblox-model-catalogue` | Not applicable | Game projects | This application is not a Roblox game. |
| `roblox-visual-realism` | Not applicable | Game projects | This application is not a Roblox game. |

## Acceptance and next owners

1. Build a hand-written inventory for the desktop application, public site and any browser preview separately. Bind every applicable identifier to implementation, article, localized resources, persistence, focused test, omission regression, packaged interaction and genuine capture evidence. This audit supplies identifiers and gaps, not those acceptance bindings.
2. Verify the core AWS flow without deploying resources first: fresh prerequisites, real browser SSO, identity verification, expired session, account switching, cancellation and rejected input. A live deployment needs a separate real-account acceptance record and resource/cost recovery verification.
3. Browser preview/backend implementation is included as the **Browser delta**, with final integration and full acceptance pending. Reconcile its HTTP routes, credentials/session isolation, browser callback behavior, documentation and tunnel access after integration. An exposed preview or a working tunnel alone does not prove AWS sign-in or feature completeness. The dedicated Docker engine could not start in this managed environment because nested cgroup permissions were denied; no host-socket fallback is accepted. A no-engine companion can verify interface, source intake and AWS authorization-link generation only.
4. Preserve designer-owned `design/` work. Add matched reference/product routes and genuine comparisons rather than treating artboards as shipped behavior.
5. Correct release evidence: the baseline workflow calls `npx electron . --screenshots=screenshots`, which launches source, not the packaged executable. Capture the installed artifact, bind evidence to its source/build digest, and reconcile README/site/release statements.
6. Implement missing foundations and broad required tool families before claiming full compliance. Record genuine scope exclusions explicitly; do not silently omit features because the core AWS flow works. Validate external records separately and report exact blockers.

The browser test suite and focused checks have separate owner-run results; this audit does not invent or freeze a test count while integration is changing. No real AWS-account login, deployed workload, clean Windows Squirrel installation or automatic update is claimed.

No completion percentage is published: applicability and acceptance remain separate dimensions, and the browser integration is still changing.
