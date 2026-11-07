# Rehearsal record

How the design pass was checked before handoff.

## Guidance used

- Stageshow skill, cached copy at upstream commit `299140fafd08df55a9c234e610c3f64af3f45531` (benjitaylor/skills, MIT). A fresh install was attempted first and refused by the build environment's policy on fetching external code, so the pinned copy was used.
- References read: `SKILL.md`, `references/craft.md`, `references/framing.md`, `references/rehearse.md`, `references/review.md`, `references/verify.md`.
- Closest gold examples: `static-card` (quiet hierarchy, real words only where the story is) for app screens and `hero-demo` (window with satellites) for the landing hero. These are real app screens, not marketing demos, so the gold structure was used as a quality bar rather than copied.

## Filming

Every artboard was rendered locally in headless Chrome with the shipped fonts (Inter, JetBrains Mono, Material Symbols Rounded) at 1440 px and 390 px after the entrance motion settled. The renderer also reported any element that pushed past the window edge. Frames are in `frames/`.

## Fresh-eye review

A separate reviewer that had not seen the build judged only the frames against `review.md` and `verify.md`. It returned 20 findings. All were fixed and re-filmed:

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Overview hero card kept two columns on phone | Card wraps; title and link take the full width |
| 2 | Environment value under its pill, task size wrapping 2 + 1 | Value on its own line; segmented controls stack; task size shown as fixed |
| 3 | Installer rows broke icon, title and value apart on phone | Rows stay on one line; checklist items stay inline |
| 4 | Landing hero overlay covered the window heading on phone | Activity satellite hidden at phone width |
| 5 | Empty band under the installer log | Log stretches to the checklist height |
| 6 | Empty half of the running log | Log sized to its lines |
| 7 | Empty lower half on Healthy | Release history added, cards in a row share a height |
| 8 | Toasts over the bottom bar, wrapping on phone | Toasts sit above the bar at full width |
| 9 | Half-empty preview cards on the landing page | Next real rows added |
| 10 | New deployment twice on the overview | Header button removed, rail button kept |
| 11, 12 | Side notes squeezed beside headings on phone | Content rows wrap; notes move under |
| 13 | Funny level value orphaned on desktop | Slider row resized so the value stays beside it |
| 14 | Wizard step fill short of the edge on phone | Side columns take the full width on phone |
| 15 | Regex token and meaning split across lines | Each pair kept as one unit |
| 16 | Ghost ring offset from the sign-in icon | Ring removed |
| 17 | Match highlight split words | Highlight padding removed |
| 18 | Dashed borders at rest read as drag-over | Solid outline at rest; dashed only while dragging |
| 19 | Shortcut chip past its field on phone | Field wraps |
| 20 | Third first-launch card shorter than its row | Cards in the row stretch; the page scrolls by design |

## Not applicable

Stageshow rules for cursor scripts, loop seams, posters and plates are written for animated marketing demos. These are real application screens, so those rules were recorded as not applicable. Restraint, framing, hierarchy, type, spacing, icons, colour and motion-with-a-cause were applied.

## Not checked

Hover, pressed and focus states were reviewed in markup, not filmed frame by frame. The light theme is a tweak on every artboard but was not filmed. Real behaviour of the built app is checked separately against these designs.

## Final polish pass, 2026-11-06

A last modernization pass over every screen of the desktop app and the landing page, drawn on the design canvas first (board 25 plus updated Settings and Interaction boards), then built into both.

### Guidance used

- Stageshow, the same pinned copy at upstream commit `299140fafd08df55a9c234e610c3f64af3f45531` (benjitaylor/skills, MIT). A fresh install was attempted again and refused by the build environment's policy on fetching external code.
- References read: `SKILL.md`, `references/craft.md`, `references/review.md`. The fresh-eye reviewer read `references/review.md` and `references/verify.md`.

### Filming

- All 26 boards rendered in headless Chromium at 1440 px and 390 px, in dark and light, with the overflow reporter on. Features and Motion are desktop-only reference sheets and Records scrolls its tab strip on purpose; nothing else reports overflow.
- Every app screen captured from the real app through its capture mode at 1320 px and 420 px wide (56 frames), and the landing page at 1440 px in both themes and at 390 px, including the right-click menu and the accessibility panel. No page errors, no horizontal overflow on the phone.

### Findings from the self-review, all fixed and re-filmed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Selects showed no arrow: component rules reset the background and wiped the chevron | The chevron rule now outranks component rules; component rules set only the background colour |
| 2 | The game server version list looked like a bare system list | Padded rows, rounded selection in the accent colour, tabular numbers |
| 3 | The lock wizard and other centred panels started off the left edge of a narrow window | Centred panels keep an 8 px margin; a saved panel position is pulled back on screen when the window shrinks |
| 4 | Right-click menus on a phone hung off the right and bottom edges | Menus are placed by their layout size, not the scaled size of their entrance animation |
| 5 | Two menu rows looked selected at once (keyboard cursor and pointer hover) | Hover is a quiet state layer; only the keyboard cursor row is strongly highlighted |
| 6 | The Personal wording info button sat alone on its own line | Moved into the card's header row |
| 7 | Settings toggles dropped onto their own line in the side column | Setting labels shrink to 160 px before the control wraps |
| 8 | The phone navigation wrapped the source link onto a second row | The source link lives in the footer on phones |
| 9 | Capture leftovers (a styled element and an open lock) bled into later frames | Capture mode restores every setting it changed and clears the appearance target |
| 10 | Menu and confirmation captures showed nothing on a fresh install | They now open on the Settings theme row and the sketch clear confirmation |

### Fresh-eye review

A separate reviewer that had not seen the build judged only 36 final frames (boards, every app screen at desktop and narrow width, and the landing page at desktop and phone) against `review.md` and `verify.md`. It returned 19 findings:

| # | Finding | Outcome |
| --- | --- | --- |
| 1 | The lock and unlock dialogs cut off their main action | Panel footers stick to the panel's bottom edge; those panels size to their content |
| 2 | No way to reach the page sections on a phone | A Sections button lists them on narrow screens |
| 3 | Landing page content cut under a blank band | Capture artefact, not a page fault: the frame was taken during a smooth scroll. Captures now scroll instantly |
| 4 | The hero activity card covered the window's account chip | Moved above the window's top edge |
| 5 | Two menu rows looked selected at once | Hover is a quiet state layer; only the keyboard cursor row is highlighted |
| 6 | Info buttons sat in a different place on every row, and Custom colour had none | Every settings control has its info button directly above it, in the same slot on every row, with a 44 px touch target and a tooltip on hover and focus |
| 7 | Blank space under short empty states | A whole-page empty state fills the pane and centres its content; the game server detail card matches the form's height |
| 8 | New tab cut off when many tabs are open | New tab stays pinned at the right end; long tab names shorten with an ellipsis |
| 9 | Port and Memory labels on different lines | Both fields share one label line and the same height |
| 10 | The rail kept Deploys highlighted on utility tabs | The rail marks nothing while a utility tab is active |
| 11 | The locked dim sum switch looked neither on nor off (board) | The board shows it on, with its lock note |
| 12 | The line under the hero headline repeated it; the headline broke awkwardly | That line now adds a new point at every funny level; the headline wraps in balanced lines in a wider column |
| 13 | The short language card left a blank block | It now holds a live language switch for the page |
| 14 | Small, low-contrast captions | Raised to 14 to 15 px in the secondary text colour |
| 15 | A crowded accessibility panel on the landing page | Long labels split into a title and a note; the accent row puts its controls under the label |
| 16 | Pale links and buttons in the light theme | Every accent tone is derived per theme from the chosen accent, so text buttons and links stay readable; the light theme no longer reuses the dark theme's pale accent |
| 17 | The custom colour value broke mid-value on a narrow window | The hex and rgb() values each stay whole |
| 18 | The confirmation card sat flush against the window edge | Menus and confirmations are placed by layout size and keep an 8 px margin |
| 19 | A lone info icon row on the Interaction board | The info button sits above its switch in the same row |

Every fix was re-filmed: boards 17, 11 and 25 at both widths in both themes, every app screen again at 1320 px and 420 px, and the landing page at 1440 px and 390 px including the new Sections menu.

### Not checked

Hover and pressed states were reviewed in markup and a few hover frames, not filmed for every control. The landing page has no info buttons yet; that gap stays open in the feature audit. Windows captures from the release build are checked separately once the release run finishes.

## Every-surface sweep, 2026-11-06

After the polish pass, a script opened every surface and measured it, because eyes skip things a measurement does not. Board 26 on the canvas holds the score.

### What was opened

- The app: all 28 capture routes (screens, panels, menus and dialogs) at phone 390 x 844, tablet 820 x 1180, 960 x 540 (a 1080p screen at 200 percent) and desktop 1440 x 900, in light and dark, in English, Cantonese and both: 672 surfaces. The app runs from its own profile, so no saved settings leak in.
- The landing page: the page, the command palette, the accessibility panel, the right-click menu, the Sections menu and the docs reader, at the same sizes, themes and languages: 138 surfaces. The page's two GitHub lookups answer with sample data, so a rate limit never counts as a finding.

### What counts as a finding

axe-core 4.10.3 with the WCAG 2.2 AA and best-practice rules; text cut by its box, pushed past the window edge, or overlapping other text in the same layer; console errors, page errors and blocked requests; and a keyboard walk with Tab that flags focus without a visible ring, focus on an unnamed control, focus on something hidden, and focus leaving an open modal dialog. Entrance animations and transitions are settled before anything is measured. The release rule is zero findings: `npm run sweep:app` and `npm run sweep:site` exit with an error on any.

### Score

Before is the released build v0.1.23 (`667b11a`) swept with the same checks. It could not shrink below 560 px tall, so its 960 x 540 pass ran at 560.

| Check | Before | After |
| --- | ---: | ---: |
| Content outside any landmark | 11982 | 0 |
| Lists missing their options | 714 | 0 |
| Text contrast below 4.5:1 | 469 | 0 |
| Controls nested inside other controls | 432 | 0 |
| Page without a main landmark | 90 | 0 |
| Focus without a visible ring | 88 | 0 |
| Buttons without a name | 24 | 0 |
| Lists and inputs without a name | 24 | 0 |
| Targets too small or covered | 18 | 0 |
| Clipped text | 16 | 0 |
| Overlapping text | 6 | 0 |
| **All checks** | **13863** | **0** |

By surface set: the app went from 2712 findings with no clean surface to 672 of 672 clean; the landing page went from 11151 findings with no clean surface to 138 of 138 clean. One root cause usually shows on many surfaces, which is why the counts are large.

### Root fixes

Each was fixed once, in the shared token or component:

1. Landmarks: the update banner is a labelled section, the tab strip is a labelled navigation, panel headers no longer pose as page banners, and the landing page has one main landmark.
2. Menus and palettes: a filter box drives a list of options, and live controls are drawn as pictures inside their options instead of real buttons nested in them. Left and Right change a value, Enter and Space act, Escape clears and then closes.
3. Tabs: close marks sit beside each tab, arrows, Home and End move between tabs, Delete closes one, and New tab sits outside the tab list.
4. Contrast: second-language text takes its control's own colour, step labels and disabled rows stay readable, and accent tones are derived per theme.
5. Focus: every field rings its whole box on focus, including date and time fields whose picker takes focus, and the range slider has its own ring. The app palette and the landing page accessibility panel keep Tab inside while open.
6. Names and targets: icon buttons and lists carry names, and info buttons keep a 44 px touch target.
7. Size: viewport heights and panel sizes are divided by the text size zoom, so large text no longer pushes the window or panels past the screen, and the window can shrink to 480 px tall.
8. Windows title bar: the window uses the platform title-bar overlay, so Windows draws its own caption buttons and Snap layouts work; the overlay colours follow the theme over a validated call.

### Corrections to the sweep itself

- Overlap and clipping are measured on the part of a box that can actually be seen, cut by every clipping ancestor, and the body of a closed disclosure is skipped. Without this, scrolled lists reported text overlapping text that was scrolled out of view.
- Capture and sweep runs closed a confirmation by removing its element but left it open in the kit's state, so every later key press was ignored and the keyboard walk saw nothing. They now close it through the kit.

### Not checked

- The real Windows caption buttons and Snap layouts: they need a Windows desktop. The release run's Windows captures are the next look.
- What a screen reader actually says: axe checks names, roles and states, not speech.
- Extension support is a new requirement and has not been started; the feature audit records it as missing.
