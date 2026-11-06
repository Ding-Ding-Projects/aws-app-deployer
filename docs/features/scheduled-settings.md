# Scheduled settings

In **Settings > Scheduled settings**, add rules such as "Theme to Dark, every day at 19:00" or "Low stimulation on, Monday to Friday at 22:00".

- Settings that can be scheduled: theme, language, accent colour, reduce motion, focus, low stimulation, time awareness, action sounds, emoji and the app name.
- For each setting, the rule whose time passed most recently wins, looking back up to a week. Rules are checked every 30 seconds.
- Changing a scheduled setting yourself holds until that setting's next rule.
- Settings show where their value came from: set by you, default, scheduled right now, or from the external source.

## External source

Turn on **Read settings from a URL** to check an http or https address every few minutes. It can return either a JSON object of settings, for example `{"settings": {"theme": "dark", "calm": "on"}}`, or a Home Assistant entity state such as `/api/states/input_select.theme`, which is mapped to the setting you choose. An optional access token is sent as a Bearer token and kept encrypted with Windows protected storage, never in settings, history or exports. Unknown settings and invalid values are ignored and listed. If a check fails, nothing changes and the reason is shown.

Scheduled rules win over the external source. School mode keeps the language in English whatever a rule says. The landing page has scheduled rules for its own settings in the accessibility panel.
