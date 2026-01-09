import React from 'react'
import type { WorkflowStatus } from '@ajna-inc/workflow-client'
export * from './context'
export * from './hooks'
import { JsonSchemaForm } from './forms'
import { TextItem, ButtonItem, Divider, Spacer, Card, Container, List, Table, Badge, ImageItem, VideoItem } from './components'

export function WorkflowInstancePanel(props: {
  status?: WorkflowStatus | null
  onAdvance?: (ev: string, input?: Record<string, unknown>) => Promise<void> | void
}) {
  const { status, onAdvance } = props
  if (!status) return <div className="text-sm text-gray-500">No status loaded.</div>
  const items = (status.ui || []) as Array<any>
  const assets = status.assets as any
  return (
    <div>
      <div className="text-sm mb-2">State: <b>{status.state}</b></div>
      <div className="space-y-2">
        {items.map((item, idx) => {
          if (item.type === 'text') return <TextItem key={idx} text={item.text || item.label} />
          if (item.type === 'button')
            return (
              <ButtonItem key={idx} disabled={item.disabled} label={item.label || item.event} onClick={() => onAdvance?.(item.event)} />
            )
          if (item.type === 'submit-button') {
            const schema = (item as any).input_schema || (item as any).schema || (item as any).ui?.schema
            if (schema) {
              return (
                <div key={idx}>
                  <JsonSchemaForm
                    schema={schema}
                    submitLabel={item.label || item.event}
                    onSubmit={(values) => onAdvance?.(item.event, values)}
                  />
                </div>
              )
            }
            return (
              <ButtonItem key={idx} disabled={item.disabled} label={item.label || item.event} onClick={() => onAdvance?.(item.event)} />
            )
          }
          if (item.type === 'divider') return <Divider key={idx} />
          if (item.type === 'spacer') return <Spacer key={idx} size={item.size || 'md'} />
          if (item.type === 'card') return <Card key={idx} title={item.title}>{renderChildren(item.children)}</Card>
          if (item.type === 'container') return <Container key={idx}>{renderChildren(item.children)}</Container>
          if (item.type === 'list') return <List key={idx} items={(item.items as any[]) || []} />
          if (item.type === 'table') return <Table key={idx} columns={item.columns || []} rows={item.rows || []} />
          if (item.type === 'badge' || item.type === 'tag') return <Badge key={idx} label={item.label} variant={item.variant} />
          if (item.type === 'image') return <ImageItem key={idx} asset={item.asset} src={item.src} alt={item.alt} assets={assets} />
          if (item.type === 'video') return <VideoItem key={idx} asset={item.asset} src={item.src} assets={assets} />
          return (
            <pre key={idx} style={{ background: '#f7f7f7', padding: 8 }}>{JSON.stringify(item, null, 2)}</pre>
          )
        })}
      </div>
    </div>
  )
}

function renderChildren(children?: any[]): React.ReactNode {
  if (!Array.isArray(children)) return null
  return children.map((c, i) => (
    typeof c === 'string' ? <div key={i}>{c}</div> : <pre key={i} style={{ background: '#f7f7f7', padding: 8 }}>{JSON.stringify(c, null, 2)}</pre>
  ))
}
