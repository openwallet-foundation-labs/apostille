export type CleanupFn = () => Promise<void> | void

declare global {
  // eslint-disable-next-line no-var
  var __WF_E2E_CLEANUPS: Set<CleanupFn> | undefined
}

globalThis.__WF_E2E_CLEANUPS = globalThis.__WF_E2E_CLEANUPS || new Set<CleanupFn>()

export function registerCleanup(fn: CleanupFn) {
  globalThis.__WF_E2E_CLEANUPS!.add(fn)
}

afterAll(async () => {
  const set = globalThis.__WF_E2E_CLEANUPS
  if (!set) return
  for (const fn of Array.from(set)) {
    try { await fn() } catch { /* ignore */ }
    set.delete(fn)
  }
})

