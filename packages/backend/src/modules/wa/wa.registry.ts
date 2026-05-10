import type { WASocket } from "@whiskeysockets/baileys";

const registry = new Map<string, WASocket>();

export function waRegistrySet(sessionId: string, socket: WASocket): void { registry.set(sessionId, socket); }
export function waRegistryGet(sessionId: string): WASocket | undefined { return registry.get(sessionId); }
export function waRegistryRemove(sessionId: string): void { registry.delete(sessionId); }
export function waRegistryAll(): Array<[string, WASocket]> { return [...registry.entries()]; }
