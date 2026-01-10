'use client'

import { useEffect, useState } from 'react'

interface Connection {
  id: string
  theirLabel?: string
  state?: string
  theirDid?: string
}

interface ConnectionContextBarProps {
  connections: Connection[]
  selectedConnectionId: string
  onConnectionChange: (id: string) => void
  onDiscover: () => void
  onRefresh: () => void
  discovering?: boolean
  refreshing?: boolean
}

export function ConnectionContextBar({
  connections,
  selectedConnectionId,
  onConnectionChange,
  onDiscover,
  onRefresh,
  discovering = false,
  refreshing = false,
}: ConnectionContextBarProps) {
  // Get selected connection details
  const selectedConnection = connections.find(c => c.id === selectedConnectionId)

  // Status indicator color
  const getStatusColor = (state?: string) => {
    switch (state?.toLowerCase()) {
      case 'completed':
      case 'complete':
        return 'bg-emerald-500'
      case 'request':
      case 'response':
        return 'bg-amber-500'
      default:
        return 'bg-surface-400'
    }
  }

  return (
    <div className="bg-surface-100 border border-border-primary/30 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Connection Label */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-secondary">Connection:</span>
        </div>

        {/* Connection Selector */}
        {connections.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-tertiary">No connections available</span>
            <a href="/connections" className="text-sm text-primary-600 hover:text-primary-700">
              Create one →
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <div className="relative">
              <select
                value={selectedConnectionId}
                onChange={(e) => onConnectionChange(e.target.value)}
                className="appearance-none bg-surface-200 border border-border-primary/40 rounded-lg pl-8 pr-10 py-2 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500/50 min-w-[200px]"
              >
                <option value="">Select connection...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.theirLabel || 'Unknown Peer'} ({c.state || 'pending'})
                  </option>
                ))}
              </select>
              {/* Status dot */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className={`block w-2 h-2 rounded-full ${getStatusColor(selectedConnection?.state)}`} />
              </div>
              {/* Chevron */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Connection Info Badge */}
            {selectedConnection && (
              <span className={`badge ${
                selectedConnection.state === 'completed' || selectedConnection.state === 'complete'
                  ? 'badge-success'
                  : 'badge-warning'
              }`}>
                {selectedConnection.state}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onDiscover}
            disabled={discovering || !selectedConnectionId}
            className="btn btn-secondary text-sm py-2 disabled:opacity-50"
          >
            {discovering ? (
              <>
                <span className="spinner h-3 w-3 mr-2" />
                Discovering...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Discover
              </>
            )}
          </button>

          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="btn btn-secondary text-sm py-2 disabled:opacity-50"
            title="Refresh data"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Helper text when no connection selected */}
      {!selectedConnectionId && connections.length > 0 && (
        <p className="text-xs text-text-tertiary mt-2">
          Select a connection to start workflows with that peer
        </p>
      )}
    </div>
  )
}
