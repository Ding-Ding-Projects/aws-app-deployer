# AWS App Deployer design

Design source of truth for the desktop app and its landing page. The artboards in [`artboards/`](artboards/) are the canvas (`canvas.json` is the index, each `.dc.html` is one screen, `app.css` holds the shared tokens). Rendered frames of every artboard at desktop (1440 px) and phone (390 px) widths are in [`frames/`](frames/). All frames are **prototype renders with sample data**, not screenshots of the built app.

## Look

"Graphite Material": a dark-first Material 3 desktop shell with a light theme, one electric-blue accent, and status colours that only ever mean status.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0b0d12` | `#f4f6fa` | Window ground, rail, title bar |
| `--s1` | `#12151c` | `#ffffff` | Main surface |
| `--s2` / `--s3` / `--s4` | `#181c25` / `#1f2430` / `#272d3a` | `#eef1f6` / `#e4e8ef` / `#d9dee8` | Cards, hover, tracks |
| `--tx` / `--tx2` / `--tx3` | `#e8ebf2` / `#a3abba` / `#8a93a3` | `#121722` / `#4a5466` / `#5c6779` | Text, secondary, tertiary (all 4.5:1 or better on their surfaces) |
| `--ac` | `#6ea8ff` | `#2457d6` | Primary actions, active stage, focus ring |
| `--ok` | `#4ade9a` | `#127a4b` | Healthy, verified |
| `--warn` | `#f5b451` | `#8f5300` | Rolled back, expiring, charges notice |
| `--err` | `#ff8a8a` | `#c62828` | Failed, needs you |

- Type: Inter 400 to 650. JetBrains Mono only for account IDs, ARNs, digests, paths and logs. Sentence case everywhere.
- Icons: Material Symbols Rounded, one weight, 16 to 20 px, filled at 16 px and below.
- Radii: 8, 12, 16, 28 (the main surface's top-left corner). Spacing on a 4 px grid; words keep a 12 px inset from every edge.
- No AI decoration: no sparkles, no purple, no gradient washes, no invented logos. The product name is a plain text wordmark.

## Motion

Every movement has a cause: arrival, a user action, or a backend event. See artboard 12.

| Motion | Duration | Easing |
| --- | --- | --- |
| Content rises in, staggered 70 ms per group | 500 ms | `cubic-bezier(.2,0,0,1)` |
| Navigation pill grows under the selected destination | 300 ms | same |
| Active-stage ring pulse while AWS works | 1.8 s loop | same |
| Check mark draws after a verified result only | 700 ms | same |
| Public link wipes open on success | 800 ms | same |
| Buttons press to 97% | 150 ms | same |
| Dialogs rise and settle | 500 ms | same |

Reduce motion (system setting or the in-app switch) turns every animation and transition into a 1 ms change. Progress is never driven by timers; stage changes come from backend progress events.

## Shell and navigation

- Frameless Windows window with a 38 px title bar and real minimize, maximize and close controls.
- Navigation rail (96 px) with a New deployment button and Deploys, Accounts, Settings and Help. At 720 px and below the rail becomes a bottom bar and the New deployment button moves into the page.
- Account and region chips in the top bar on the overview. Switching account never retargets an operation already running.
- `Ctrl+Shift+F` opens the command palette from anywhere; the palette supports a regex mode with a live explanation of each token.

## Task flows

1. **First launch** (artboards 1, 4b). Charges notice, profile discovery, IAM Identity Center setup, and a prerequisite check. Missing tools get one **Install missing tools** button: each tool is downloaded from its publisher, its Authenticode signature is checked, it installs silently, and known problems are repaired automatically (package manager missing, interrupted download, WSL not ready, PATH not refreshed, Docker not started). The only stop is a declined Windows permission prompt or a blocking company policy, which is named exactly. No download pages are opened.
2. **Connect** (2, 3, 4). Browser sign-in through AWS CLI v2 with states: checking prerequisites, browser opened, waiting (with timeout), verifying, connected, cancelled, timed out, expired, failed. The verified account, role, ARN, profile and region are shown; tokens never are.
3. **New deployment** (6, 7). Account, source, configure, review. The source step inspects the real Dockerfile or Compose file and lists every service with Supported or Not supported yet before anything is created. Task size is fixed at 0.25 vCPU and 512 MiB in this version. Review lists what is created (VPC across two zones, one ALB, one NAT gateway, two Fargate tasks, ECR repository, logs) and the ongoing cost drivers without invented prices. One Deploy button runs the rest.
4. **Running** (8). Nine visible stages mapped from backend stages, sanitized activity log, operation ID, elapsed time, and a Cancel that explains AWS may finish what it accepted.
5. **Healthy** (9). Shown only after AWS completion, healthy targets and an endpoint probe. Prominent link with Copy and Open, release history, rollback note.
6. **Failure and rollback** (10). What was detected, what was repaired automatically, what needs the user, the smallest next step, and what is still running.
7. **Settings** (11). Theme, accent colour, reduce motion, app name, schedule, language (English, Cantonese, both), funny level with a live preview, emoji switch, narration, action sounds, personal wording JSON, focus, calm and school modes, and the dim sum surprise switch.

## Dim sum surprise switch

The surprise cannot be opted out of. Settings shows its switch on; turning it off makes the switch slide back on and shows "Nice try. Dim sum surprise cannot be turned off." in a polite status message, announced to screen readers. School mode hides the surprise and the switch.

## Component states

Every interactive component is drawn with rest, hover, pressed, focused (2 px accent ring, 2 px offset), disabled (45% opacity, no pointer events) and loading states where they apply. Lists use full-width rows with a 12 px inset hover fill. Status badges always pair colour with a word and usually an icon, so status never relies on colour alone.

| Surface | Empty | Loading | Error | Disabled | Cancelled | Recovery |
| --- | --- | --- | --- | --- | --- | --- |
| Deployments | "No deployments yet" with New deployment | Skeleton rows at real row geometry | Sign-in expired dialog (4) | n/a | n/a | Re-sign-in keeps the list |
| Sign-in | n/a | Waiting step with timeout | Failed or timed out step with retry | Manual device flow shown unavailable | Back to profiles | Reopen browser |
| Wizard | No folder chosen | Inspecting file | Unsupported services listed | Next disabled until a supported service is chosen | Draft kept | Draft restored on reopen |
| Running | n/a | Active stage pulse | Failure screen (10) | n/a | Remote state explained | Refresh from AWS |
| Installer | Nothing missing | Per-tool progress | Named blocker | n/a | Skip a tool | Automatic repair list |

## Keyboard

- Tab order follows reading order: title bar controls, rail, top bar, then content top to bottom, left to right.
- Arrow keys move within the rail, segmented controls and palette results; Enter runs, Escape closes dialogs and the palette and returns focus to the control that opened them.
- `Ctrl+Shift+F` command palette, `Ctrl+N` new deployment, `Ctrl+,` settings.
- Every icon-only button has an accessible name; dialogs trap focus and label themselves.

## Responsive behaviour

Pages are fluid. Columns are flex rows that wrap (`flex: 999 1 560px` content beside `flex: 1 1 320px` side panels). At 720 px and below the rail becomes a bottom bar, key and value tables stack, segmented controls stack vertically, environment rows put the value on its own line, and toasts sit above the bottom bar at full width. Frames at 390 px are in `frames/*-phone.png`.

## Landing page

Artboard 15: hero with a composed product shot and two satellites, a "works with" strip, three illustrated steps, a diagram of what lands in the AWS account, a feature bento, screen previews, FAQ and a closing download band. The download button points at the latest verified release only.

## Feature coverage

Artboard 14 maps every catalogue feature to the board that draws it, the spec in this file, a repository or CI record, or "not this product". It is design coverage only; shipping status lives in the implementation inventory in the repository root.
