import { NOTIFICATION_TYPES, NotificationType } from './types'

// Strongly-typed default enabled map (no string index)
// All known event types default to enabled; override via env or rule
export const defaultEnabled: Readonly<Record<NotificationType, boolean>> = Object.fromEntries(
  (NOTIFICATION_TYPES as readonly NotificationType[]).map((t) => [t, true])
) as Readonly<Record<NotificationType, boolean>>

// Optional global/tenant-aware rule (e.g., feature flags, AB tests)
export type EnableRule = (tenantId: string, type: NotificationType) => boolean
let overrideRule: EnableRule | null = null
export function setEnableRule(rule: EnableRule) {
  overrideRule = rule
}

// Env allowlist: NOTIFICATION_TYPES=type1,type2
// Only values matching NotificationType are accepted; others ignored.
function parseEnvAllowlist(): Set<NotificationType> | null {
  const env = process.env.NOTIFICATION_TYPES
  if (!env) return null
  const raw = env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const allowed = new Set<NotificationType>()
  for (const val of raw) {
    if ((NOTIFICATION_TYPES as readonly string[]).includes(val)) {
      allowed.add(val as NotificationType)
    }
  }
  return allowed.size > 0 ? allowed : null
}

const envAllowlist = parseEnvAllowlist()

export function isEnabled(tenantId: string, type: NotificationType): boolean {
  if (overrideRule) return overrideRule(tenantId, type)
  if (envAllowlist) return envAllowlist.has(type)
  return !!defaultEnabled[type]
}

export function listEnabledTypes(tenantId?: string): NotificationType[] {
  if (overrideRule && tenantId) {
    return (NOTIFICATION_TYPES as readonly NotificationType[]).filter((t) => overrideRule!(tenantId, t))
  }
  if (envAllowlist) return Array.from(envAllowlist)
  return (Object.keys(defaultEnabled) as NotificationType[]).filter((t) => defaultEnabled[t])
}
