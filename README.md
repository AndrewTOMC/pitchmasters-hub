# Pitchmasters Royale Pitch Hub

The pitcher and judge hub, admin console and automated emails for **Pitchmasters Royale**, Friday 30 October 2026 at BMW Cape Town City.

- **Hub:** `index.html`. Pitchers and judges sign in with the email and password from their invite, choose "A pitcher" or "A judge", and hand over their photo, programme copy or judge's profile, and logistics. Add `?demo=pitcher` or `?demo=judge` to try it without a backend.
- **Admin console:** `admin/index.html`, at `/admin`. Lee-Anne and Andrew are admins: they add people, send emails and see everything. Annie is a viewer: she sees progress and can export. Add `?demo=1` (and `&as=viewer`) to try it without a backend.
- **Backend:** `backend/Code.gs`, a Google Apps Script web app on the "Pitchmasters Pitchers" sheet. It is built from `backend/src/*.gs` with `backend/build.sh`. See `backend/SETUP.md` for the paste-and-publish step.
- **Emails:** built inside the backend (`backend/src/30_emails.gs`). There are invites, reminders and confirmations for pitchers and judges, plus console access. Previews are in `emails/`.
- **Look:** `assets/royale/tokens.css` holds the Royale palette and type, and the gold ornaments are SVGs in the same folder. Painting cut-outs go in `assets/royale/*.webp`. The email header images are in `assets/email/`.

## Where things change

- Event facts on the hub: `CONFIG` near the bottom of `index.html`.
- Event facts in the emails and console: the `EVENT` block at the top of `backend/src/00_core.gs`, then rebuild and re-paste `Code.gs`.
- Console logins: the **Admins** tab in the sheet.

## Tests

- `node backend/test/harness.js` runs 83 backend checks against mocked Google services.
- `node backend/test/render-emails.js` regenerates the email previews.
