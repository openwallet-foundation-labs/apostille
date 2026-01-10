'use client'

import { useState } from 'react'

interface Instance {
  id: string
  instance_id: string
  template_id: string
  template_version?: string
  connection_id?: string
  state: string
  section?: string
  status: string
  createdAt: string
  updatedAt?: string
}

interface Connection {
  id: string
  theirLabel?: string
  state?: string
}

interface InstancesTableProps {
  instances: Instance[]
  connections: Connection[]
  loading?: boolean
  activeInstanceId: string | null
  onOpen: (instanceId: string) => void
}

export function InstancesTable({
  instances,
  connections,
  loading = false,
  activeInstanceId,
  onOpen,
}: InstancesTableProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  // Get connection label helper
  const getConnectionLabel = (connectionId?: string) => {
    if (!connectionId) return '-'
    const conn = connections.find(c => c.id === connectionId)
    return conn?.theirLabel || connectionId.slice(0, 8) + '...'
  }

  // Filter instances
  const filteredInstances = instances.filter(inst => {
    if (filter === 'all') return true
    if (filter === 'active') return inst.status === 'active'
    if (filter === 'completed') return inst.status === 'completed' || inst.state === 'done'
    return true
  })

  // Get state color
  const getStateColor = (state: string, status: string) => {
    if (status === 'completed' || state === 'done') return 'badge-success'
    if (state.includes('fail') || state.includes('reject')) return 'badge-error'
    if (state.includes('await') || state.includes('pending')) return 'badge-warning'
    return 'badge-primary'
  }

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const activeCount = instances.filter(i => i.status === 'active').length
  const completedCount = instances.filter(i => i.status === 'completed' || i.state === 'done').length

  return (
    <div className="bg-surface-100 border border-border-primary/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-200 text-text-secondary flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Workflow Instances</h2>
            <p className="text-xs text-text-tertiary">
              {activeCount} active, {completedCount} completed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-gray">{instances.length}</span>
          <svg
            className={`w-5 h-5 text-text-tertiary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border-primary/30">
          {/* Filters */}
          <div className="px-5 py-3 bg-surface-50/50 border-b border-border-primary/20 flex items-center gap-2">
            <span className="text-xs text-text-tertiary mr-2">Filter:</span>
            {(['all', 'active', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={(e) => {
                  e.stopPropagation()
                  setFilter(f)
                }}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-200 text-text-secondary hover:bg-surface-300'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'active' && ` (${activeCount})`}
                {f === 'completed' && ` (${completedCount})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <span className="spinner h-6 w-6 mx-auto" />
              <p className="text-sm text-text-tertiary mt-2">Loading instances...</p>
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-text-tertiary">
                {filter === 'all'
                  ? 'No workflow instances yet.'
                  : `No ${filter} instances.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border-primary/30">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Connection
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/20">
                  {filteredInstances.map((instance) => {
                    const isActive = instance.instance_id === activeInstanceId
                    return (
                      <tr
                        key={instance.id}
                        className={`transition-colors ${
                          isActive
                            ? 'bg-primary-50/50'
                            : 'hover:bg-surface-50'
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                            <span className="font-medium text-text-primary">
                              {getConnectionLabel(instance.connection_id)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div>
                            <div className="text-sm text-text-primary">{instance.template_id}</div>
                            {instance.template_version && (
                              <div className="text-xs text-text-tertiary">v{instance.template_version}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`badge ${getStateColor(instance.state, instance.status)}`}>
                            {instance.state}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-text-secondary">
                          {formatRelativeTime(instance.updatedAt || instance.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => onOpen(instance.instance_id)}
                            className={`btn text-xs py-1.5 px-3 ${
                              isActive
                                ? 'btn-secondary'
                                : 'btn-primary'
                            }`}
                          >
                            {isActive ? 'Active' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
