# Closeout prompt

Copy the block below into a new session to continue this work. It records state up to the commit that adds this file.

````text
Project: Ding-Ding-Projects/aws-app-deployer (public). Desktop app (Electron) that deploys a Dockerfile or Compose project to the user's own AWS account, plus a landing page on GitHub Pages and a browser companion.

Objective of the last session: a final polish and modernization of every interface, designed on the design canvas first and implemented in the real app and landing page, then released.

State on the remote:
- main = d62bd67, released as v0.1.24 (normal release; Windows installer, full package, RELEASES, Windows captures in screenshots.zip). Release run 42358949325 succeeded; the landing page deployed from the same commit.
- Branch ai/feature/20261106-every-surface-sweep holds the same commits plus this file. It is merged into main apart from this file and is kept, because the cleanup step requires an archive the last environment could not write.
- Handoff issue: #1.

Done and verified:
- Every-surface sweep (npm run sweep:app, npm run sweep:site): 13863 findings on v0.1.23, zero after. App 672 of 672 surfaces clean at f18f2aa; landing page 138 of 138 at df615f4 (unchanged since).
- npm run sweep:motion passes (entrance animations play on open and never replay on a key press); watched failing with the fix switched off.
- npm test: 93 passed, 0 failed.
- One highlighted row in menus and both command palettes; tab strip edge fades; Windows title bar uses the platform overlay.
- Design records: design/artboards (27 boards, board 26 is the sweep score), design/REHEARSAL.md, docs/evidence/interface (captures with hashes, shown in the readme).

Not done or not verified:
- Windows caption buttons and Snap layouts on a real Windows desktop.
- The browser companion's access screen is not in the sweep script (hand-checked: one browser log line for the expected 401 before sign-in).
- Extension support is not started.
- Info buttons outside Settings and on the landing page.

Rules that matter here: every push to main publishes the next tagged release; builds stay unsigned; run the every-surface sweep and the motion check before an interface release and fix findings in the shared token or component; keep docs/FEATURE-AUDIT.md, ROADMAP.md and HANDOFF.md accurate.

Next safe steps: verify the title bar on a Windows desktop; add the companion access screen to the sweep; then plan extension support from docs/FEATURE-AUDIT.md.
````
