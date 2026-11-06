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
