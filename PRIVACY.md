# Privacy Policy for RemindAir

Effective date: 2026-10-28

RemindAir is an Obsidian plugin developed by Hardevv. This policy explains what data the plugin accesses, why, and how it is stored.

## Data the plugin accesses

When you connect a Google account, RemindAir may access:

- Your Google account email address, to show which account is connected.
- Google Calendar events, to create and update notes in your vault.
- Google Tasks, to read tasks and, in future versions, update them.

The plugin only accesses this data after you connect your Google account and run a sync. It does not read other Google data.

## How the data is used

The data is used only to provide the plugin features:

- Showing your connected account.
- Creating and updating calendar event notes in your vault.
- Reading and syncing tasks.

The plugin does not use your data for advertising, profiling, or any other purpose.

## Where the data is stored

- OAuth tokens are stored locally in the plugin data file inside your Obsidian vault.
- Calendar events and tasks are written as notes in your vault.
- The plugin does not send your data to the developer or to any server other than Google APIs.

## Data sharing

RemindAir does not sell, rent, or share your Google data with third parties. Requests go directly from your device to Google APIs:

- `accounts.google.com`
- `oauth2.googleapis.com`
- `www.googleapis.com`
- `tasks.googleapis.com`

Google's own privacy policy applies to data processed by Google.

## Google API Limited Use

RemindAir's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.

## Data retention and deletion

Data stays in your vault until you delete it.

- Disconnect your Google account in the plugin settings to revoke the token and remove the stored tokens.
- Delete the generated notes to remove synced calendar and task data.
- You can also revoke access at any time from your Google Account permissions page: https://myaccount.google.com/permissions

## Security

OAuth tokens are stored locally by Obsidian. You are responsible for protecting access to your vault and device. The plugin does not operate a backend service and does not store your data on any server.

## Children

RemindAir is not directed to children under 13 and does not knowingly collect data from children.

## Changes

If this policy changes, the updated version will be published at this URL with a new effective date.

## Contact

For privacy questions or data deletion requests, open an issue at:

https://github.com/Hardevv/obsidian-RemindAir/issues
