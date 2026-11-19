// 0.25.5: "auto" now means the device sign-in (email code, no localhost callback). The older tests exercise the hook machinery on the
// OAuth prefix, so their default is the setting signInPath=oauth (the opt-in path for a user who supplies a server named
// kinitro_ai); a test that passes its own options keeps them.
import { test as base } from 'claude-code/testing'

const DEFAULT = { signInPath: 'oauth' }
export const test: any = (name: string, a: any, b?: any) => {
  if (typeof a === 'function') return base(name, { options: DEFAULT }, a)
  return base(name, { ...a, options: { ...DEFAULT, ...(a?.options ?? {}) } }, b)
}
