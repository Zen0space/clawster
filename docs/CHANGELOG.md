# Changelog

All notable changes to Clawster are documented here.

---

## Releases

## [v1.1.0] — 2026-04-22

### New
- **Settings page** — click the gear icon in the sidebar to view your account: email with a verified badge (confirming your license key), display name, role, and member-since date.
- **Dashboard stats** — the dashboard now shows four live counters: campaigns completed, campaigns failed, campaigns currently running, and devices connected.
- **MinIO / S3 media storage** — media uploads can now be stored in a self-hosted MinIO bucket (or any S3-compatible service) instead of local disk. Configure via environment variables.
- **Backup & restore scripts** — new scripts let you take a full database + media snapshot and restore it to any date, with optional offsite upload via rclone.

### Improved
- **Sleep hours** — "quiet hours" is now called "sleep hours" throughout the app. Start and end times are displayed and selected in 12-hour AM/PM format (e.g. 11 PM – 7 AM) instead of raw 24-hour numbers.
- **Sleep banner** — when a running campaign is inside its sleep window, a yellow banner now appears on the campaign detail page so you know why sending is paused and when it resumes.
- **Server hint** — running campaign pages now show a note confirming that campaigns keep running on the server even after closing the app window.

### Fixed
- Changing a campaign's name, message, or contact list no longer resets the pacing preset to "custom".

---

## [v1.0.6] — 2026-04-21

### Fixed
- Sign-up and login no longer fail silently — the app was not connecting to the backend in previous releases due to a misconfigured build setting.

---

## [v1.0.5] — 2026-04-21

### Fixed
- macOS: opening the app no longer results in a hard "move to trash" block. The installer is now ad-hoc signed, so you can allow it via System Settings → Privacy & Security → Open Anyway.

---

## [v1.0.4] — 2026-04-21

### Fixed
- Backend server failed to start when deployed with Docker — it was only reachable from inside the container itself.

---

## [v1.0.3] — 2026-04-21

### Improved
- macOS (.dmg) and Windows (.exe) installers are now automatically attached to each GitHub release — no manual steps needed.
- Release builds include SHA-256 checksums for file verification.

---

## [v1.0.2] — 2026-04-21

### Improved
- Desktop installer binaries are now produced for every release.

---

## [v1.0.1] — 2026-04-21

### Improved
- Updated app icon across all platforms.

---

## [v1.0.0] — 2026-04-21

### New
- **License key required at sign-up** — each account is created with a unique license key. Keys are single-use and verified server-side.
- **Contacts** — import contacts from a CSV file, add them manually, and organise them into named lists.
- **Campaigns** — create WhatsApp broadcast campaigns with a message template, pick a contact list and a connected WhatsApp session, and configure humanised send pacing (random delays, daily cap, quiet hours, typing simulation).
- **Image attachments** — attach a media file (image) to a campaign message.
- **Campaign presets** — choose from built-in pacing presets (Careful, Moderate, Aggressive) when creating a campaign.
- **WhatsApp session management** — connect and manage multiple WhatsApp accounts via QR-code pairing.
- **Media library** — upload and reuse media assets across campaigns.
