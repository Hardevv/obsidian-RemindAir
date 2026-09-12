# RemindAir

Obsidian plugin for reminders and Google Calendar sync.

## Features

- Set a reminder for any line in a note.
- Connect a Google account.
- Pull Google Calendar events into notes in a chosen folder.
- Incremental sync with Google sync tokens and optional automatic sync while Obsidian is open.
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

## Calendar sync

Sync is one way, from Google Calendar into the events folder. The first run pulls the whole window and stores a Google sync token per calendar. Later runs send only that token, so Google returns just the changed events, and events removed in Google come back as cancelled and their notes go to the trash.

Automatic sync is on by default and runs every 45 seconds (minimum 15) while Obsidian is open and its window is active. The check ticks every 15 seconds and slows down to once a minute while the window sits in the background, so an idle app sends no requests at all. Switching back to the Obsidian window syncs right away, at most once every 10 seconds, and a failure delays the next attempt with a growing backoff.

## Privacy

See [PRIVACY.md](PRIVACY.md).
