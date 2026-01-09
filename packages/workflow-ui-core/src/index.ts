import jmespath from 'jmespath'

export type UiItem = Record<string, unknown>

export type UiEnv = {
  context?: Record<string, unknown>
  participants?: Record<string, unknown>
  artifacts?: Record<string, unknown>
  viewer?: { role?: string; connection_id?: string; did?: string; participantKey?: string }
}

export function evalGuard(expr: string | undefined, env: UiEnv): boolean {
  if (!expr) return true
  try {
    const res = jmespath.search(env, expr)
    return Boolean(res)
  } catch {
    return false
  }
}

export function shouldShow(item: UiItem, env: UiEnv, tokens: string[]): boolean {
  const audience = toArray<string>(item.audience as any)
  if (audience.length && !audience.some((a) => tokens.includes(a))) return false
  const profile = toArray<string>(item.profile as any)
  if (profile.length && !profile.some((p) => tokens.includes(p))) return false
  const showWhen = item.showWhen as string | undefined
  if (showWhen && !evalGuard(showWhen, env)) return false
  return true
}

export function viewerTokens(viewer?: UiEnv['viewer'], uiProfile?: string): string[] {
  const tokens: string[] = []
  if (viewer?.role) tokens.push(viewer.role)
  if (viewer?.participantKey) tokens.push(`participant:${viewer.participantKey}`)
  if (uiProfile) tokens.push(uiProfile)
  return tokens
}

function toArray<T>(v: T | T[] | undefined): T[] {
  return Array.isArray(v) ? v : v !== undefined ? [v] : []
}

