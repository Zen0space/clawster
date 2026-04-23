# Changelog

All notable changes to Clawster are documented here.

---

## Releases

## [v1.2.6] — 2026-04-24

### Fixed
- **In-app updates** — fixed the build pipeline so update bundles are now signed correctly. Once you install v1.2.6 manually, every future update will arrive in-app via the **install update** button on the Changelog page.

---

## [v1.2.4] — 2026-04-24

### Fixed
- **In-app updates now work** — clicking **check for update** on the Changelog page actually downloads and installs the new version when one is available, instead of failing with a "failed — retry" message. After this release, you'll be able to update Clawster from inside the app — no more visiting the GitHub releases page to grab a fresh installer.

---

## [v1.2.3] — 2026-04-24

### Fixed
- **Stay signed in** — your session now refreshes itself in the background a minute before it would expire, so saving settings, opening conversations, or any other action no longer fails with a sign-in error mid-use.

---

## [v1.2.0] — 2026-04-24

### New
- **Chatbot (beta)** — an AI assistant that automatically replies to inbound WhatsApp messages on your behalf. Set it up from the new **Chatbot** page in the sidebar. Toggle it on per connected number, and it handles replies around the clock while you sleep.
- **Knowledge base** — teach the bot everything about your business: products, pricing, FAQs, policies, and contact details. The bot answers only what you've written here, and politely redirects anything outside that scope so it never makes things up.
- **Inbox** — a shared conversation view where every WhatsApp reply lands in one place. Read what contacts are saying, reply manually when you want to step in, and toggle **Take over** on any thread to pause the bot for that contact.
- **Test bot** — before going live, hit **test bot** in the Chatbot page to chat with your knowledge base directly in the app. Nothing gets sent to WhatsApp.
- **Monthly token usage** — the Chatbot page shows how many AI tokens you've used this month out of the 1,000,000 monthly limit, with a colour-coded bar.

### Redesigned
- **Chatbot config** is now its own page in the sidebar (labelled **chatbot · beta**) rather than a button buried inside the WA Sessions page.

### Improved
- **Bot reply pacing** — the bot waits up to 30 seconds after the last message before replying, so bursts of messages get one combined answer instead of several rapid-fire replies. Send 5 messages and the bot replies once covering all 5.
- **Bot safety** — if the bot sends 15 or more replies to the same contact in a day without resolution, it pauses itself and shows an amber notice in the Inbox so you can review.
- **Inbox scrolls to the latest message** automatically when you open a conversation or when a new message arrives, even in long threads.
- **Stay signed in** — the app now silently refreshes your session in the background, so you no longer get logged out while saving settings mid-session.

---

## [v1.1.2] — 2026-04-22

### New
- **Changelog** — click the version number at the bottom of the sidebar to open the full release history inside the app.

### Improved
- **Campaign details** — the top of each campaign page now shows the time it was started (or created, if it hasn't started yet), so you always know when activity began.
- **Sleep hours** — the sleep window and the "💤 sleep hours active" banner now both use the same clock, so they always agree on whether a campaign is sleeping or sending.

### Fixed
- **Warmup, Safe, and Normal campaigns not sending** — campaigns with sleep hours configured were stuck in sleep mode all day. Sending now correctly resumes during daytime hours as expected.

---

## [v1.1.1] — 2026-04-22

### Fixed
- Fixed a startup issue that could prevent Clawster from launching. Image attachments are stored more reliably and no longer need extra setup to work.

---

## [v1.1.0] — 2026-04-22

### New
- **Settings page** — click the gear icon in the sidebar to view your account: your email with a verified badge, display name, role, and member‑since date.
- **Dashboard stats** — the dashboard now shows four live counters: campaigns completed, campaigns failed, campaigns currently running, and devices connected.
- **Shared image storage** — optionally keep attached images in a shared storage location so they're available across machines.
- **Backup & restore tools** — new scripts let you save a full snapshot of your contacts, campaigns, and images, and restore it later. Backups can also be uploaded to cloud storage.

### Redesigned
- **Sleep hours** — "quiet hours" is now called "sleep hours" everywhere. Start and end times are picked in 12‑hour AM/PM format (e.g. 11 PM – 7 AM) instead of raw 24‑hour numbers.

### Improved
- **Sleep banner** — when a running campaign is inside its sleep window, a yellow banner appears on the campaign page so you know why sending paused and when it will resume.
- **Server note** — running campaign pages now remind you that sending keeps going even if you close the app.

### Fixed
- Changing a campaign's name, message, or contact list no longer resets the pacing preset back to "custom".

---

## [v1.0.6] — 2026-04-21

### Fixed
- Sign‑up and login now work reliably. Earlier versions couldn't reach Clawster's servers, so the forms would fail without an error.

---

## [v1.0.5] — 2026-04-21

### Fixed
- **macOS** — opening Clawster no longer hits a hard "move to trash" block. If macOS still warns you, allow it from System Settings → Privacy & Security → Open Anyway.

---

## [v1.0.4] — 2026-04-21

### Fixed
- Fixed an issue that left hosted installs of Clawster unreachable from outside the machine they were installed on.

---

## [v1.0.3] — 2026-04-21

### Improved
- Mac (.dmg) and Windows (.exe) installers are now attached to every release automatically — no manual download steps needed.
- Each installer ships with a checksum so you can verify the file is genuine before running it.

---

## [v1.0.2] — 2026-04-21

### Improved
- Desktop installers are now built for every release.

---

## [v1.0.1] — 2026-04-21

### Redesigned
- Updated Clawster's app icon across Mac and Windows.

---

## [v1.0.0] — 2026-04-21

### New
- **License key at sign‑up** — each account is created with a unique one‑time license key.
- **Contacts** — import contacts from a CSV file, add them by hand, and organise them into named lists.
- **Campaigns** — create WhatsApp broadcast campaigns with a message template, pick a contact list and a connected WhatsApp account, and configure human‑like send pacing (random delays, daily cap, quiet hours, typing simulation).
- **Image attachments** — attach an image to a campaign message.
- **Campaign presets** — pick from built‑in pacing presets when creating a campaign, each tuned for a different risk level.
- **WhatsApp accounts** — connect and manage multiple WhatsApp accounts via QR‑code pairing.
- **Media library** — upload and reuse images across campaigns.
