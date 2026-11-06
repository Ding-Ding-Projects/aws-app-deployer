# Appearance editor

Right-click any element, or press `Shift+F10` on it, and choose **Edit appearance…**. The panel styles that one element and shows the change live.

- **States:** style the element at rest, on hover, on keyboard focus, and while pressed. A dot marks states that have changes.
- **Properties:** font, size, weight, italic, underline, strikethrough, all capitals, letter spacing, text colour, background, border colour, corner radius, glow and opacity. Each property has its own Reset.
- **Undo and redo:** `Ctrl+Z` and `Ctrl+Y` (or `Ctrl+Shift+Z`) while the panel is open, up to 100 steps for this window.
- **Copy and paste style:** copy one element's style and paste it onto another.
- **Presets:** name a style and apply it to any element later.
- **Reset:** reset one property, one element, or every element (with the super confirmation). Presets stay.
- **Export and import:** styles save as UTF-8 JSON with the schema `aws-app-deployer.appearance/1`. Imported files are checked property by property; anything unknown or out of range is dropped and never reaches the page.

Styles live in your settings file under `appearance`, so they appear in local history and can be restored from there.
