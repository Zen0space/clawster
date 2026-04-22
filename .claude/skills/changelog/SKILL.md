---
name: changelog
description: Generate a user-facing changelog entry and update docs/CHANGELOG.md. Use when preparing a new release or when the user asks to document what changed.
---

Generate a changelog entry written for **end‑users of Clawster** — people who use the desktop app to run WhatsApp campaigns. They do not know or care about Docker, Node, Prisma, TypeScript, S3, MinIO, Baileys, pg‑boss, environment variables, or commit hashes. Speak their language.

## Step 1 — Determine the version

If the user passed a version as an argument (e.g. `/changelog v1.0.5`), use that.
Otherwise read it from `packages/desktop/src-tauri/tauri.conf.json` → `version` and prefix with `v`.

## Step 2 — Gather commits

Run:
```
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s"
```

If HEAD is already tagged (no commits since last tag), compare the two most recent tags:
```
git log $(git tag --sort=-version:refname | sed -n '2p')..$(git tag --sort=-version:refname | sed -n '1p') --pretty=format:"%s"
```

## Step 3 — Understand the changes

Read modified files only far enough to answer: **"what did the user gain, lose, or see differently?"** Skip anything a user can't perceive.

- `packages/desktop/src/pages/` — screens users interact with
- `packages/desktop/src/components/` — visible UI pieces
- `packages/backend/src/modules/` — only matters if it changes behaviour users notice (sending, limits, messaging, sign‑in)
- `packages/db/prisma/schema.prisma` — only matters if a new field surfaces in the UI

## Step 4 — Write the entry

### Vocabulary — translate tech into plain language

Before writing, swap technical terms for user‑facing ones. Examples:

| Don't write                                  | Write instead                                      |
|---                                           |---                                                 |
| backend / server / API                       | the app, Clawster, sending, sync                   |
| Docker / container / deploy                  | (usually omit — users don't run these)             |
| MinIO / S3 / bucket / `MEDIA_ROOT`           | image storage, attached images                     |
| Prisma migration / schema / column           | (omit — describe the user‑visible field instead)   |
| JWT / token / cookie                         | sign‑in, stay signed in                            |
| WebSocket / SSE / pg‑boss / queue            | live updates, background sending                   |
| Tauri / Vite / build artifact                | desktop app, installer                             |
| `camelCase` identifiers, file paths          | the feature's UI name                              |
| "fix a race condition in the sender loop"    | "fixed a rare case where a message sent twice"     |
| timezone / UTC / offset                      | sleep hours, local time                            |

### Pick the right section

Use whichever of these apply — skip any with no entries. Order them: New → Redesigned → Improved → Fixed.

- `### New` — a brand‑new thing the user can open, click, or configure.
- `### Redesigned` — a screen or control that now **looks** or **feels** different (renaming, re‑laying out, changing icons/colours, different wording).
- `### Improved` — existing feature behaves better: faster, clearer copy, smarter defaults, better feedback, less friction.
- `### Fixed` — something was broken and now isn't. Describe the symptom the user saw, not the root cause.

### Writing rules

- **Lead with what the user does or sees**, not what the code does. "You can now…", "Campaigns now…", "The sidebar shows…".
- **Bold the feature name** when a line introduces or renames something: `- **Sleep hours** — …`.
- One sentence per bullet is plenty. Two if the feature genuinely needs context (how to access it, what it replaces).
- Present tense, plain verbs: *adds*, *shows*, *fixes*, *renames*, *speeds up*.
- No code spans for identifiers the user never types. `MEDIA_ROOT`, `quietStart`, `processCampaignTick` — all out. Code spans are fine for things a user actually types (file names they pick, keyboard shortcuts).
- No version‑comparison drama: avoid "previously…", "in v1.0.x it used to…". Just say what it does now.
- **Omit entirely:** CI changes, Dockerfile/Coolify/infra tweaks, dependency bumps, lint/typecheck fixes, pure refactors, tests, internal renames, build‑tool details, migration commands.

### Examples (good vs. bad)

Bad: *"Replaced `new Date().getHours()` with a UTC+8 offset so the pg‑boss worker doesn't reschedule into the quiet window."*
Good: *"**Sleep hours** now honour Malaysia time on the server, so Safe, Normal, and Warmup campaigns send during the day as expected."*

Bad: *"Removed MinIO integration; media uploads use local FS via `MEDIA_ROOT`."*
Good: *"Image attachments are stored more reliably and no longer require extra setup to work."*

Bad: *"Fixed crash in `sender.ts` when `mediaAssetId` was null."*
Good: *"Fixed a crash that could happen when sending a text‑only campaign."*

## Step 5 — Prepend to `docs/CHANGELOG.md`

Insert the new block immediately after the `## Releases` heading using this format:

```markdown
## [v1.0.5] — YYYY-MM-DD

### New
- …

### Redesigned
- …

### Fixed
- …

---
```

Use today's actual date. Do **not** rewrite or remove any existing entries.

## Step 6 — Commit

```
git add docs/CHANGELOG.md
git commit -m "docs: changelog for <version>"
```

Do not push — let the user decide when to push.
