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

Notes are named `YYYY-MM-DD HH-mm │ Title`, or `YYYY-MM-DD │ Title` for all-day events. The separator is a vertical bar lookalike, so it reads like `|` without colliding with `[[note|alias]]` links, and it marks where the title starts. When the name is taken the plugin appends a counter, so the events folder never ends up with two notes on the same path. The file name carries the event: everything after the date prefix is the title, and the prefix always follows `start`. Change the title by renaming the note: the new title is pushed a couple of seconds later. Change the date and the prefix is put back from `start`, so the calendar stays the source of truth for time. The event itself is identified by the id stored in the `remindair` property, so moving a note does not break the link to Google.

Google Calendar is the source of truth for events that already exist. The first run pulls the whole window and stores a Google sync token per calendar. Later runs send only that token, so Google returns just the changed events, and events removed in Google come back as cancelled and their notes go to the trash.

Sending changes to Google works from the same folder. A note with `start` is created in Google Calendar on the next sync, titled after its file name, using `googleCalendarId` or the first configured calendar. The plugin then keeps everything technical in a single `remindair` property: the event id, the calendar id, the last synced title, the last payload hash and the recurrence data. Editing the note later patches the event, but only when the content really changed, because the stored hash is compared with the current payload and the write back cannot loop. `end` is optional and defaults to an hour after `start`, or the next day for all-day events. A note written while offline stays in the folder and is pushed on the next sync that can reach Google. The `Create calendar event` command works in two ways. With text selected it creates an event note titled after the selection and links it in place, so the sentence keeps a link to the event. Without a selection it fills `start` and `end` in the current note and gives it the `YYYY-MM-DD HH-mm │ Title` name, keeping the title you already had. Either way `start` is 15 minutes from now and `end` an hour later.

Automatic sync is on by default and runs every 45 seconds (minimum 15) while Obsidian is open and its window is active. The check ticks every 15 seconds and slows down to once a minute while the window sits in the background, so an idle app sends no requests at all. Switching back to the Obsidian window syncs right away, at most once every 10 seconds, and a failure delays the next attempt with a growing backoff.

## Privacy

See [PRIVACY.md](PRIVACY.md).
