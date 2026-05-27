import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request userId context.  Set it once at the API layer (after auth token
 * validation) and every appendActivity call in the same async call tree will
 * automatically carry the correct userId — no need to thread it through every
 * function signature.
 */
const storage = new AsyncLocalStorage<string | null>();

/** Run `fn` with the given userId bound to the current async context. */
export function withUserId<T>(userId: string | null, fn: () => T): T {
  return storage.run(userId, fn);
}

/** Read the userId that was set for the current async context (null if none). */
export function getCurrentUserId(): string | null {
  return storage.getStore() ?? null;
}
