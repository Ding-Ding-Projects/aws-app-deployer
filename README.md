# AWS App Deployer

A local Windows desktop application for deploying containerized web applications to your own AWS account.

Connect an AWS IAM Identity Center profile through browser sign-in, choose a Dockerfile or a single-service Compose file, and press Deploy. The app builds and publishes the image, creates networking and an Application Load Balancer, runs two ECS Fargate tasks, waits for healthy targets, checks the public link, and hands it to you. Each Windows user keeps their own AWS profiles and credentials.

Landing page: https://ding-ding-projects.github.io/aws-app-deployer/ (source in [`site/`](site/)). Design: [`design/`](design/).

## Status

Early development. Every push to `main` runs the tests, builds a Windows installer, captures screenshots of that build on a Windows runner, and publishes a tagged release. Releases have passed automated tests only; no release has been verified against a live AWS account yet. See [ROADMAP.md](ROADMAP.md) for what is shipped, partial and not started.

## Run from source

```sh
npm ci
npm start          # launch the app
npm test           # backend, main-process and renderer tests
npm run dist:win   # build the Windows installer into dist/
```

On Windows, `download-dependencies.bat`, `build.bat` (tests, then run) and `build-installer.bat` (tests, then the unsigned installer) wrap the same commands.

`npm run screenshots` launches the app, saves a PNG of each main screen into `screenshots/`, and quits.

### Every-surface sweep (before each interface release)

`npm run sweep:app` opens every screen, panel and menu of the app at phone (390 x 844), tablet (820 x 1180), 960 x 540 (a 1080p screen at 200 percent) and desktop (1440 x 900) sizes, in light and dark, in English, Cantonese and both. On each one it records axe-core WCAG 2.2 AA and best-practice violations, console errors, clipped, off-screen and overlapping text, and, with a keyboard walk, focus on hidden or unnamed controls, focus without a visible ring, and focus escaping a modal dialog. It uses its own profile, so your settings are not touched, and writes `sweep-out/sweep-app.md` and `.json`. It exits with code 2 when there are findings.

`npm run sweep:site` does the same for the landing page and its overlays (palette, accessibility panel, right-click menu, Sections menu, docs reader). Serve `site/` first, for example `python3 -m http.server 8765 -d site`; it needs Playwright with Chromium. The page's GitHub lookups are answered from sample data so the sweep never depends on rate limits.

`SWEEP_ROUTES`, `SWEEP_SIZES`, `SWEEP_LANGS` (and `SWEEP_SURFACES` for the site) narrow a run; `SWEEP_SHOTS=1` saves a capture of each English surface. Fix findings at the shared token or component, not per screen, then look at the captures as well: the sweep finds what eyes skip, and eyes find what it cannot measure.

## What a deployment creates

A VPC across two availability zones, a public Application Load Balancer, one NAT gateway, two Fargate tasks in private subnets, an ECR repository with an immutable image, and CloudWatch logs. These are billed by AWS until you delete them. Closing the app never deletes infrastructure.

## Layout

| Path | Owner | Contents |
| --- | --- | --- |
| `src/backend/` | AWS implementation | Profiles, sign-in, identity, deployment orchestration |
| `src/main/` | Integration | Electron window, scoped bridge with operation IDs, dependency installer, settings store |
| `src/renderer/` | Design | The interface, built from `design/` |
| `site/` | Design | Landing page, deployed with GitHub Pages |
| `design/` | Design | Artboards, tokens, prototype renders, review record |

Read the [handoff](HANDOFF.md) for product flows, ownership and the integration contract. Do not include credentials, account-specific configuration, or private instructions in this repository.

## Browser preview and feature audit

A protected browser companion supports remote AWS console sign-in and Dockerfile project intake. See [setup and current limits](docs/BROWSER-PREVIEW.md), [the complete feature audit](docs/FEATURE-AUDIT.md), and [the latest designer handoff](HANDOFF.md). Live AWS authentication, deployment and the temporary public tunnel remain unverified.
