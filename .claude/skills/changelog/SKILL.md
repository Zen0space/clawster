---
name: changelog
description: Generate a user-facing changelog entry and update docs/CHANGELOG.md. Use when preparing a new release or when the user asks to document what changed.
---

Generate a user-facing changelog entry and prepend it to `docs/CHANGELOG.md`.

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

Read any relevant modified files to understand what actually changed from a user perspective:
- `packages/desktop/src/pages/` — new or changed screens
- `packages/desktop/src/components/` — new UI components
- `packages/backend/src/modules/` — new or changed API behaviour
- `packages/db/prisma/schema.prisma` — new data concepts

## Step 4 — Write user-facing release notes

Transform raw commits into clean, human-readable notes.

**Rules:**
- Write for end-users, not developers. No commit hashes, no branch names, no file paths.
- **Omit entirely:** CI changes, Dockerfile changes, dependency bumps, linting fixes, TypeScript/build-tool details, refactors with no visible effect.
- Use simple present tense: "Campaigns now support…", "Fixed a crash when…"
- Group under these headings (skip any section with no entries):
  - `### New` — brand-new features users can interact with
  - `### Improved` — enhancements to existing features
  - `### Fixed` — bugs now resolved

## Step 5 — Prepend to `docs/CHANGELOG.md`

Insert the new block immediately after the `## Releases` heading using this format:

```markdown
## [v1.0.5] — YYYY-MM-DD

### New
- ...

### Fixed
- ...

---
```

Use today's actual date. Do **not** rewrite or remove any existing entries.

## Step 6 — Commit

```
git add docs/CHANGELOG.md
git commit -m "docs: changelog for <version>"
```

Do not push — let the user decide when to push.
