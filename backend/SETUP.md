# Pitchmasters Royale backend: the one step Andrew does

The backend is the same Google Apps Script as July, attached to the **Pitchmasters Pitchers** sheet. You paste in the new version once. The web address stays the same, so nothing else needs to change.

## Paste and publish (about 5 minutes)

1. Open the sheet: https://docs.google.com/spreadsheets/d/1I2x6gXW7zDxnOBrbCp-dTU_vBaSzW5xWzPirb9BXAFA/edit
2. **Extensions > Apps Script.**
3. Click into `Code.gs`, select everything (Ctrl+A), delete it, and paste the whole of the new `backend/Code.gs`. Save (Ctrl+S).
4. **Deploy > Manage deployments.** Click the pencil on the existing deployment, set **Version: New version**, then **Deploy**.
   - Do not choose "New deployment". That would make a new web address and the hub would keep talking to the old one.
5. If Google asks you to approve permissions, approve them. The permissions are the same as July: the sheet, Drive and sending email as you.

## Check it worked

Open this in a browser:
https://script.google.com/macros/s/AKfycbzG0bBQcG8uOw1QdrFOuSOmysY53N804XaIbGxyxTea_7EA80Qhue3Q59P_HFw3gdqt8w/exec

You should see `"version":"2-royale"`. If you still see the old message, the new version did not publish; repeat step 4.

## What lives where

- **Royale Oct 2026** tab: this event's pitchers and judges. The console adds people here, the hub writes their answers here.
- **Admins** tab: console logins (email, name, role, password). Role `admin` can do everything; `viewer` can look and export.
- **Messages** tab: every "Ask the team" message. Each one is also emailed to Annie and Lee-Anne.
- **July 2026 (archive)** tab: the July cohort, untouched.
- Drive: photos land in `Pitcher Uploads > Royale Oct 2026 > <code> <name> (<role>)`.

## Email sending

Emails go out from **helloyou@andrewwolhuter.com** as "Andrew Wolhuter", exactly like July. That address must stay set up as a "Send mail as" alias on the Google account that owns this script.

- Invites and reminders are pushed from the admin console.
- A confirmation is sent automatically, once, the first time someone locks in.

## Changing event details later

Everything the emails say about the night lives in the `EVENT` block at the top of `Code.gs`. The hub's own copy lives in `CONFIG` near the bottom of `index.html`.
