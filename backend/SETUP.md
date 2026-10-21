# Pitchmasters Royale backend: the one step Andrew does

The backend is the Apps Script project **Pitchmasters New Hub** (owned by andrew@theonmediacollective.com). It reads and writes the **Pitchmasters Pitchers** sheet by its ID. Its web app address is:
https://script.google.com/macros/s/AKfycbxSil_S689c6GYL5l6S63klkYuy5NwnFlc_ZXYmc9IOPuUMQ9twQrZreZrw4d6Y7bNW/exec

The July script project still exists with its old address; nothing uses it any more.

## Updating the code later (about 5 minutes)

1. Open the **Pitchmasters New Hub** project at script.google.com.
2. Click into `Code.gs`, select everything (Ctrl+A), delete it, and paste the whole of the new `backend/Code.gs`. Save (Ctrl+S).
3. **Deploy > Manage deployments.** Click the pencil on the existing deployment, set **Version: New version**, then **Deploy**.
   - Do not choose "New deployment". That would make a new web address and the hub would keep talking to the old one.
4. If Google asks you to approve permissions, approve them. The permissions are the same as July: the sheet, Drive and sending email as you.

## Check it worked

Open this in a browser:
https://script.google.com/macros/s/AKfycbxSil_S689c6GYL5l6S63klkYuy5NwnFlc_ZXYmc9IOPuUMQ9twQrZreZrw4d6Y7bNW/exec

You should see `"version":"2-royale"`. If you still see the old message, the new version did not publish; repeat step 3.

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

## Optional: keep it warm

In the Apps Script editor, pick `installKeepWarm` in the function dropdown and press **Run** once. It pings the web app every 5 minutes so the first sign-in of the day is not slow.
