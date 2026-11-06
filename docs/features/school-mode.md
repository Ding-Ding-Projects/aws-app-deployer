# School mode

School mode is one switch shared by every app from this publisher on your Windows user. Turn it on in **Settings > Focus and comfort** or from the command palette.

While it is on:

- Everything is shown in English.
- Funny levels, personal wording, the Cantonese and bilingual options, the dim sum surprise and release code names are removed from every screen, search result and notification.
- Your earlier choices stay saved and come back when you turn it off.

You can rename the mode. After a rename, the app uses only your chosen name.

Turning it on the first time asks you to set a PIN or password. Turning it off asks for it again. After 5 wrong tries the app waits before the next try, starting at 30 seconds and doubling up to an hour. Only a scrypt hash is stored, in `school-mode.json` inside the shared `Ding-Ding-Projects Shared` folder in your app data. This is a speed bump, not security: deleting that file resets it, and the panel tells you where the file is.

The landing page has the same mode in its accessibility panel. It is stored only in that browser, with a PBKDF2 hash of the PIN, and clearing the site's data resets it.
