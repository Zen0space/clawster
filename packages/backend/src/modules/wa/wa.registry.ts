import type { WASocket } from "@whiskeysockets/baileys";

const registry = new Map<string, WASocket>();

// Return types use `any` to avoid TS2742 — pnpm stores @hapi/boom@9 (Baileys transitive)
// at a non-portable path. Callers cast to WASocket where needed.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function waRegistrySet(sessionId: string, socket: WASocket): void { registry.set(sessionId, socket); }
export function waRegistryGet(sessionId: string): any { return registry.get(sessionId); }
export function waRegistryRemove(sessionId: string): void { registry.delete(sessionId); }
export function waRegistryAll(): any[] { return [...registry.entries()]; }
/* eslint-enable @typescript-eslint/no-explicit-any */
