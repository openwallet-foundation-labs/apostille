import React, { createContext, useContext, useMemo, useState } from 'react'
import { WorkflowClient } from '@ajna-inc/workflow-client'

type ClientContextType = {
  client: WorkflowClient
}

const ClientContext = createContext<ClientContextType | undefined>(undefined)

export function WorkflowProvider({ baseUrl, token, children }: { baseUrl: string; token?: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ client: new WorkflowClient(baseUrl, token) }), [baseUrl, token])
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
}

export function useWorkflowClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useWorkflowClient must be used within WorkflowProvider')
  return ctx.client
}

type UiProfile = 'sender' | 'receiver' | undefined
const UiProfileContext = createContext<{ uiProfile: UiProfile; setUiProfile: (p: UiProfile) => void } | undefined>(undefined)

export function UiProfileProvider({ initial, children }: { initial?: UiProfile; children: React.ReactNode }) {
  const [uiProfile, setUiProfile] = useState<UiProfile>(initial)
  const value = useMemo(() => ({ uiProfile, setUiProfile }), [uiProfile])
  return <UiProfileContext.Provider value={value}>{children}</UiProfileContext.Provider>
}

export function useUiProfile() {
  const ctx = useContext(UiProfileContext)
  if (!ctx) throw new Error('useUiProfile must be used within UiProfileProvider')
  return ctx
}

