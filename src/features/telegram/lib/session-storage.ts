import type { NativeSession } from "@/features/portal/model/auth";
import { telegramWebApp } from "@/features/telegram/model/web-app";

const operations = new Map<string, Promise<unknown>>();
const valid = (value: unknown): value is NativeSession => Boolean(value && typeof value === "object" && "token" in value && typeof value.token === "string" && /^[a-f0-9]{64}$/.test(value.token) && "expiresAt" in value && typeof value.expiresAt === "number" && Number.isSafeInteger(value.expiresAt) && value.expiresAt > Date.now());

/** Credentials live in Telegram Keychain/Keystore, never web storage or URL parameters. */
export function telegramSessionStorage(identity: string, isCurrent: () => boolean) {
  const app = telegramWebApp(); const storage = identity.startsWith("telegram-") && app?.isVersionAtLeast("9.0") ? app.SecureStorage : undefined;
  const key = `node_login_v1_${identity}`;
  let saved: NativeSession | null = null; let loaded: Promise<void> | undefined;
  function serial<T>(action: () => Promise<T>): Promise<T | undefined> {
    const result = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => isCurrent() ? action() : undefined);
    operations.set(key, result); void result.finally(() => { if (operations.get(key) === result) operations.delete(key); }); return result;
  }
  function call<T>(action: (done: (value: T | undefined) => void) => void): Promise<T | undefined> {
    return new Promise(resolve => {
      let finished = false;
      const done = (value: T | undefined) => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => done(undefined), 2500);
      try { action(done); } catch { done(undefined); }
    });
  }
  async function read() {
    if (!storage) return null;
    loaded ??= serial(async () => {
      const raw = await call<string>(done => storage.getItem(key, (error, value) => done(!error && typeof value === "string" ? value : undefined)));
      try { const value: unknown = JSON.parse(raw ?? "null"); if (valid(value)) saved = value; } catch { /* Corrupt or missing storage falls back to the cookie. */ }
    }).then(() => undefined);
    await loaded;
    return saved && valid(saved) ? saved : null;
  }
  async function save(value: NativeSession, relevant: () => boolean = () => true) {
    if (!storage || !valid(value)) return;
    await read(); if (saved?.token === value.token && saved.expiresAt === value.expiresAt) return;
    await serial(async () => { if (!relevant()) return; saved = value; await call<boolean>(done => storage.setItem(key, JSON.stringify(value), (error, stored) => done(!error && stored === true))); });
  }
  async function clear() {
    if (!storage) return;
    await read(); if (!saved) return;
    await serial(async () => { saved = null; await call<boolean>(done => storage.removeItem(key, (error, removed) => done(!error && removed === true))); });
  }
  return { supported: Boolean(storage), read, save, clear };
}
