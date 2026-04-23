---
name: phase-plan
description: Refactor a product spec (prod.md or a feature brief) into one or more `docs/development/{feature}.md` files, each broken into phases where every phase ships a testable vertical slice (backend + frontend together — never all-backend-then-all-frontend). Use when the user gives you a big spec and asks to turn it into a phased implementation plan, or says "split this into phases", "plan the build", "break down into dev phases", etc.
---

Turn a product spec into phased, testable development plans. The core discipline: **each phase must be a vertical slice that the user can run and verify end-to-end**. No "Phase 1: backend only, Phase 2: frontend only" — that's a recipe for mismatched APIs and dead code.

## Invocation

The user typically invokes this with one of:
- `/phase-plan <path-to-spec.md>` — split a multi-feature spec into per-feature files.
- `/phase-plan <feature-name>` — user describes a single feature inline; produce one file.
- `/phase-plan` with no args — ask which spec or feature, then proceed.

If the user supplies a path, read the file fully before doing anything else. If they describe the feature inline, treat the conversation itself as the spec.

## Step 1 — Detect project context

Before writing plans, gather context so the output fits this codebase:

1. Read `package.json` (root + `packages/*/package.json`) to detect:
   - Framework: Next.js, Vite + React, Tauri, SvelteKit, etc.
   - **State library:** look for `jotai`, `zustand`, `redux`, `mobx`, `@tanstack/react-query`. This matters — see Step 4.
   - ORM: Prisma, Drizzle, TypeORM.
   - Backend framework: Fastify, Express, Hono, NestJS.
2. Read `CLAUDE.md` if present — honour any conventions it declares.
3. Glance at `packages/*/src/` structure to learn the module layout (so phase file-path references are accurate, not invented).

Do this silently; don't dump the findings on the user.

## Step 2 — Identify features to produce

- **If the input is a prod.md with multiple features** (e.g. "Chatbot, Analytics, Scheduling"), list them back to the user and confirm the split before writing files. Don't silently decide — a feature boundary the user disagrees with means rework.
- **If the input is a single feature**, skip the confirmation and proceed to Step 3.

One file per feature. File path: `docs/development/<feature-slug>.md`. Slug is kebab-case, lowercase, derived from the feature name (e.g. "Chatbot Auto-Reply" → `docs/development/chatbot-auto-reply.md`). If `docs/development/` doesn't exist, create it. Note: this directory is gitignored (`.gitignore` entry `docs/development`), so plans stay local to the developer's checkout — don't expect them in the remote.

## Step 3 — Structure each feature file

Use this skeleton. Each section is required unless marked optional.

```markdown
# <Feature Name> — Implementation Plan

<1–2 sentence elevator pitch: what the feature does and who benefits. No architecture yet.>

Each phase ships a **vertical slice** (backend + frontend + migration if needed) so the feature is testable end-to-end at every milestone. No phase is "backend only" or "frontend only."

---

## Why this feature

<2–4 sentences. What problem does it solve? What's broken or missing today that makes this worth building?>

---

## Architecture overview

<ASCII diagram or bullet list showing the data flow: request → system → response. Name the concrete modules/files that will carry the logic. Keep it under 30 lines.>

**Key design decisions:**
- <Bullet per decision — reuse existing infra wherever possible, explicit about what's new.>

---

## Data model additions (optional)

<Only if the feature needs schema changes. Show the Prisma/Drizzle model exactly. Note any indexes, cascades, or unique constraints.>

---

## Environment / config additions (optional)

<Only if new env vars are needed. Table form: var name, example, purpose. Mark each required or optional, and describe the failure mode if missing.>

---

## Phase 1 — <Short goal in title>

**Goal:** <One sentence. What does the user gain when this phase lands?>

**Backend**
- <Concrete bullets — tables created, routes added, modules touched, with file paths.>

**Frontend**
- <Concrete bullets — pages added, components modified, state atoms/stores added.>

**Testable outcome:** <One sentence the tester can actually execute. "Log in, click X, expect Y on screen within Z seconds.">

---

## Phase 2 — <…>

<Repeat the Backend / Frontend / Testable outcome structure.>

---

<…more phases…>

---

## Out of scope (for now)

- <Things you considered and rejected. Each with a one-line "why not yet" — scope creep, needs more demand, blocked on something else.>

---

## Open questions to resolve before Phase 1

1. <Concrete question the user should answer. Include your recommendation in parentheses.>
2. <…>
```

## Step 4 — Phase design rules

These are hard rules. Violating them produces plans the user will reject.

### Vertical slices only

Every phase must touch both backend and frontend (unless the feature is genuinely one-sided, e.g. a CLI tool or a pure data migration — in which case state that explicitly). The pattern to follow:

- **Phase 1** usually delivers the thinnest working loop: one endpoint + one screen that calls it. Ugly is fine. Real is the point.
- **Subsequent phases** add capability layer by layer: persistence → auth → error handling → safety rails → polish.
- Every phase ends with a **Testable outcome** line that is genuinely testable by a human in under 60 seconds.

If a phase has a Backend section but no Frontend section (or vice versa), merge it with an adjacent phase until both are present.

### Frontend conventions to bake in

Detect the state library from `package.json` in Step 1 and honour it. If the project uses **Jotai**, plan atoms. If **Zustand**, plan stores. If neither is installed but the user mentions React state in the spec, ask:

> This project doesn't have a state library yet. For this feature I'd recommend **Jotai** (fine-grained atoms, minimal boilerplate) or **Zustand** (centralized store, easier for larger shapes). Which do you want?

Bake these rules into every Frontend section you write:

- **No `useEffect`** except as a last resort. Before reaching for it, prefer:
  - Derived atoms (Jotai) or selectors (Zustand) for computed state.
  - TanStack Query (if present) for server state — it handles fetching, caching, refetching, and subscriptions without effects.
  - Event handlers for user-triggered side effects.
  - Router loaders / route-level data fetching for navigation-driven loads.
  - WebSocket subscriptions registered at the store level, not in component effects.
- If a phase genuinely needs `useEffect`, the plan must explain *why no other option works* in one sentence. "Subscribing to a browser API with no alternative" is valid. "Fetching on mount" is not — that's what TanStack Query is for.
- **No `as any` casts.** Types must be expressed honestly. If a shape is genuinely unknown at a boundary, use `unknown` + a narrowing check, or a zod/valibot schema. Flag any spot in the spec where typing is non-obvious as an Open Question rather than silently papering over it with `as any`.
- Props and hooks must have explicit return types or clearly inferable ones. If a generic is needed, name it.

Call these conventions out in the file, once, in a short note under "Architecture overview" like:

```markdown
**Frontend conventions:**
- State via Jotai atoms (matches the rest of the app).
- No `useEffect` except where noted — server state goes through TanStack Query, derived state through atoms.
- No `as any` — unknown boundaries use `unknown` + narrowing.
```

Adjust Jotai/Zustand to whichever the project actually uses.

### Backend conventions

- File paths in bullets must match the actual module layout from Step 1 (e.g. `packages/backend/src/modules/<feature>/routes.ts`). Don't invent directories that don't exist — propose them in the architecture section and then reference them consistently.
- Mention migrations explicitly when schema changes (e.g. "Add migration `<timestamp>_add_<feature>.sql`"). Don't assume a migration tool — match what the project uses (Prisma migrate, Drizzle kit, raw SQL, etc.).
- When reusing existing infrastructure (queues, caches, websocket bus, pacing engines, auth middleware), name it. "Reuse `pg-boss` queue from the campaigns module" is useful; "enqueue a job" is not.

### Phase naming

Format: `## Phase N — <Short imperative goal>`. Examples:
- `Phase 1 — Inbound capture + read-only inbox`
- `Phase 3 — LLM client wiring + health check`
- `Phase 5 — Bot generates and sends replies`

Not: `Phase 1 — Backend setup` or `Phase 2 — UI`. Those are the anti-pattern this skill exists to prevent.

## Step 5 — Write the file(s)

- Create `development/` if missing.
- Write each feature file. If the file already exists, ask before overwriting — the user may have edits.
- Do **not** commit. Leave staging/committing to the user.

After writing, output a short summary to the user:
- Number of files written, with paths.
- Number of phases per file.
- Any Open Questions you surfaced that need an answer before Phase 1.

## Step 6 — Offer the next step

End with a single concrete question, e.g.:

> Want me to start implementing Phase 1 of `development/chatbot-auto-reply.md`, or review the plan first?

## Anti-patterns to reject

If the user pushes for any of these, explain why it's worse and suggest the vertical-slice alternative:

- "Do all the backend first, then the frontend." — Produces APIs the UI doesn't need and UI flows the API can't serve. Vertical slices catch mismatches early.
- "One giant Phase 1." — Can't be tested until it's all done. Split it.
- "Skip the Testable outcome line." — That line is the whole point; it forces each phase to deliver user-visible value.
- "Use `useEffect` for fetching." — Redirect to TanStack Query (or whatever the project uses for server state).
- "Just `as any` the types, we'll fix it later." — "Later" never comes. Make it an Open Question instead.

## When not to use this skill

- The user asks for a one-off quick fix, not a multi-phase feature.
- The feature is genuinely one file of code (e.g. "add a button"). Phase planning is overhead for tiny work.
- The user already has a phased plan and just wants implementation help.
