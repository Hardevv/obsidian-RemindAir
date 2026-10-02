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

Sending changes to Google works from the same folder. A note with `start` is created in Google Calendar on the next sync, titled after its file name, using `googleCalendarId` or the first configured calendar. The plugin then keeps everything technical in a single `remindair` property: the event id, the calendar id, the last synced title, the last payload hash and the recurrence data. Editing the note later patches the event, but only when the content really changed, because the stored hash is compared with the current payload and the write back cannot loop. `end` is optional and defaults to an hour after `start`, or the next day for all-day events. A note written while offline stays in the folder and is pushed on the next sync that can reach Google. Deleting a note deletes its event in Google Calendar, which is on by default and can be turned off in the settings. The deletion is queued in the plugin state, so it also works offline and survives a restart, and Google keeps the event in its own trash for 30 days. A recurring event is one note, so deleting that note removes the whole series. `Create event` opens a picker that starts on the month view, with the day already selected and a `Next` button that opens the day grid, seven days wide on desktop and three on mobile. The grid opens on a half hour slot that starts in fifteen minutes, a click picks a thirty minute slot and a drag sets the whole range. The block being created carries its own range and name, so the footer holds only the buttons. With text selected the selection becomes the title and the new note is linked in place, so the sentence keeps a link to the event. Without a selection the modal asks for the name first and then offers `Confirm & copy link`, which puts the link on the clipboard because there is nothing to link in the note. The month view is keyboard friendly: arrows move by day and by week, `Home` and `End` jump to the edges of the week, `PageUp` and `PageDown` change the month, and `Enter` opens the day grid for the focused date. In the day grid the arrows move the event by a slot or by a day, `Shift` plus an arrow stretches its end, and `Enter` confirms, so the whole flow works without the mouse. The picker also shows what is already booked: notes in the events folder are drawn immediately and work offline, then the synced calendars are fetched in the background and drawn on top. Month days get a dot per event, the day grid gets blocks laid out side by side when they overlap, each block is labelled with its start time, and all day events get their own band under the day header. `Create event - fill this note's properties` is the other one: with a selection it opens the same picker, and without one it fills `start` and `end` in the note you are already in and gives it the `YYYY-MM-DD HH-mm │ Title` name, keeping the title you had. Either way `start` is 15 minutes from now and `end` an hour later.

Automatic sync is on by default and runs every 45 seconds (minimum 15) while Obsidian is open and its window is active. The check ticks every 15 seconds and slows down to once a minute while the window sits in the background, so an idle app sends no requests at all. Switching back to the Obsidian window syncs right away, at most once every 10 seconds, and a failure delays the next attempt with a growing backoff.

## Privacy

See [PRIVACY.md](PRIVACY.md).
