# Context menus

Right-click any element, or press `Shift+F10`, for actions that fit it: open or copy a deployment link, select, export, remove, reset a setting, copy text. Every menu starts with a filter field and its own regex builder. Shortcuts shown in a menu are the ones that work.

## Live controls

Menu rows that stand for a value show the working control right beside the label: a switch for an on or off setting, segmented choices for options such as the theme or language, a stepper for a level such as text size or the funny level, and a swatch for a colour. Changing a control updates the real setting straight away, saves it, updates every other place that shows it, and keeps the menu open so you can adjust several values in one visit.

- Right-click a setting to get its own control first. Every menu also ends with quick controls for the theme, text size, reduce motion and action sounds.
- Keyboard: focus stays in the filter while Up and Down move the highlighted row. Enter runs a command or flips a switch, Space does the same while the filter is empty, Left and Right change a choice or a stepper, Home and End jump to the first and last rows, Tab moves between the filter and the regex switch, and Escape clears the filter, then closes the menu and returns focus. Typing goes into the filter.
- Pointer: moving the pointer over a row moves the one highlight there, so the row you point at is the row Enter runs. There is never a second, hover-only highlight. A touch does not move it.
- Screen readers hear a filter box that controls a list of options, and each option's name carries its value, for example "Theme: Dark" or "Action sounds, checked". The switches, segments and steppers drawn inside an option are pictures of the control, not separate buttons, so nothing interactive is nested inside an option. Clicking a picture still changes the value.
- The filter and regex builder find control rows by their labels. A value that cannot change from where you opened the menu stays visible but disabled, with the reason, for example the language while School mode is on.
- The landing page uses the same menu, with controls for its theme, language, text size, reduce motion and accent colour.
