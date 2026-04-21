# Changelog

All notable changes to Clawster are documented here.

---

## Releases

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
