# Interface captures, 2026-11-06

Current captures of the desktop app and the landing page after the final polish pass and the every-surface sweep. They show sample data only: no AWS account is connected and no deployment exists.

## How they were taken

- App: the app's own capture mode (`electron . --screenshots=<dir>`), Electron 45.2.3, run from source on Linux under a virtual display (`xvfb-run`), at a 1320 x 860 window for desktop frames and 420 x 860 for narrow frames, scale 1, light theme (the capture machine has no theme preference, so System resolves to light). The capture mode uses a fresh profile, so no saved settings leak in.
- Landing page: `site/` served locally and opened in headless Chromium through Playwright 1.63.0, at 1440 x 900 and 390 x 844, with the dark colour scheme.
- Source: commit `df615f4`. The app and landing page sources (`src/`, `site/`) did not change between that commit and the commit that adds these files.
- Linux draws no Windows caption buttons, so the right end of the app's title bar is empty in these frames. On Windows the system draws minimise, maximise and close there, with Snap layouts. Release builds are captured on a Windows runner by the release workflow.

## Files

| File | Shows | Size | SHA-256 |
| --- | --- | --- | --- |
| `deployments-desktop.png` | Deployments, empty state with next steps | 1320 x 860 | `74c163a0bbf28eeab2f6fc75ec2649ac9561cebc8bde9b811da9993168793aee` |
| `settings-menu-desktop.png` | Settings with the right-click menu and its live controls; one highlighted row | 1320 x 860 | `95bd1df580873d10648d0d981be12a90c1c7a3b48d91a6d672d9995af42d3fda` |
| `command-palette-desktop.png` | Command palette over Help | 1320 x 860 | `387c27363d94c108525162f94c158ffd5fb093d7f455f54cd6f67af2bd3ebbab` |
| `tabs-narrow.png` | Tab strip on a narrow window, with edges fading where more tabs are hidden | 420 x 860 | `a4f406daafd1456792d69324ffa0db223163aae20872e0f3c0b23b4b993cf0a8` |
| `landing-desktop-dark.png` | Landing page hero, dark | 1440 x 900 | `8ede8b0739644139f65b827fb0565d1828cf08f190535cec63db3381f5e132b1` |
| `landing-phone-dark.png` | Landing page hero on a phone, dark | 390 x 844 | `a2d10d5f3e714f747fa3119a03497c663d8018ff56ae858a672120526df0b3be` |

## Privacy

Every frame was looked at before it was added. None shows an account, a credential, a file path from the capture machine, or personal data. Captures that show the app data folder path (Support Tickets, the unlock panel) were left out.
