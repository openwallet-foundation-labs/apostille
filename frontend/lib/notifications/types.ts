export type NotificationType = string

export interface WsNotification<T = unknown> {
  v: 1
  id: string
  type: NotificationType
  tenantId: string
  createdAt: string
  data: T
}

