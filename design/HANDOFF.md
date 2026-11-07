# Design handoff

This is the design delivery the root [handoff](../HANDOFF.md) asks for. Start with [DESIGN.md](DESIGN.md).

## Contents

| Path | What it is |
| --- | --- |
| `DESIGN.md` | Tokens, motion, task flows, component states, keyboard and responsive rules |
| `artboards/canvas.json` | Canvas index: frame positions, titles and notes |
| `artboards/*.dc.html` | One screen per file, 26 artboards |
| `artboards/app.css` | Shared tokens, shell, components and motion |
| `frames/` | Prototype renders of every artboard at 1440 px and 390 px (Features and Motion are desktop-only reference sheets) |
| `REHEARSAL.md` | How the pass was filmed and reviewed, and every finding fixed |

## Screens

1. First launch and prerequisite checks
2. AWS browser sign-in and return
3. Connections and profiles
4. Expired sign-in
4b. One-click dependency installer
5. Deployments overview
6. Wizard: Dockerfile or Compose source
7. Wizard: configure and review
8. Deployment running
9. Healthy deployment
10. Failure, repair and rollback
11. Settings
12. Motion and tokens
13. Command palette, regex builder and notifications
14. Feature map
15. Landing page
16. Updates, provenance and exact check reasons
17. Context menus, super confirmation, info buttons and accessibility tools
18. Tabs, local history, changelog, offline docs and export
19. Element locks, unlock ladder, Support Tickets and appearance editor
20. Live charts, logo, Base64 toolkit, file converter, voices and wording celebration
21. Landing page tools: palette, language, accessibility, docs, direct download, dim sum switch
22. Attention modes and per-language funny levels
23. School mode, scheduled settings, colour picker with alpha, funny level on every message
24. Converters, game server manager, local AI and sketching
25. Polish system: controls, menus with live controls, empty states, scrollbars

## Rules the implementation must keep

- Every account, URL, digest and status in these files is sample data. The built app shows only real backend results.
- Stage progress comes from backend events, never timers. A failure never shows a completed progress bar.
- Task size is fixed at 0.25 vCPU and 512 MiB until the backend supports sizing.
- The NAT gateway is shown as a created resource and an ongoing cost.
- The dependency installer never opens a download page and never answers the Windows permission prompt.
- The dim sum surprise switch always springs back on; School mode hides the surprise entirely.
- Every select shows its chevron; every context menu row that holds a control changes the real setting in place and keeps the menu open; only the keyboard cursor row is strongly highlighted.
- Panels and menus stay inside the window at every width, and page changes cross-fade only when motion is allowed.

## Stageshow record

Commit `299140fafd08df55a9c234e610c3f64af3f45531`, used from the pinned cache because a fresh install was refused by the build environment. Gold examples: `static-card`, `hero-demo`. References read and review results are in `REHEARSAL.md`.
