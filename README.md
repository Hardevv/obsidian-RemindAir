# RemindAir

Obsidian plugin for reminders and Google Calendar sync.

## Features

- Set a reminder for any line in a note.
- Connect a Google account.
- Pull Google Calendar events into notes in a chosen folder.
- Google Tasks support is in progress.

## Installation

The plugin is not in the community store yet. To test it, copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/obsidian-notifier/` and enable the plugin in Obsidian.

## Google setup

The plugin uses a Google OAuth client of type `Desktop app` with PKCE. No client secret is shipped in the build.

For local development, put the client ID in `.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Then run `pnpm build`.

## Privacy

See [PRIVACY.md](PRIVACY.md).
