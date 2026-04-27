'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiPost, DashboardStats } from '../utils/api';
import Link from 'next/link';
import { Icon, ErrorIcon } from '../components/ui/Icons';
import { useNotifications } from '../context/NotificationContext';

export default function DashboardPage() {
  const { tenantId, token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { notifications } = useNotifications();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestStats = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiPost('/api/dashboard/stats', {});
      setStats(data);
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError(err.message || 'Unable to load dashboard statistics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void requestStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void requestStats();
    }, 750);
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [notifications, token]);

  return (
    <div>
      {/* Welcome */}
      <div className="welcome">
        <div className="welcome-l">
          <div className="welcome-eyebrow">Tenant Workspace</div>
          <div className="welcome-h">Welcome back{stats?.tenant?.label ? `, ${stats.tenant.label}` : ''}</div>
          <div className="welcome-meta">
            <span className="badge green"><span className="badge-dot" /> Production</span>
            {tenantId && <span className="mono">{tenantId.slice(0, 8)}...{tenantId.slice(-6)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <Link href="/dashboard/connections" className="btn btn-secondary">
            <Icon name="plus" size={14} /> Create Invitation
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <ErrorIcon className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stat Grid */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          {
            label: 'Active Connections',
            value: stats?.connections?.total || 0,
            foot: `${stats?.connections?.active || 0} online now`,
            icon: 'link' as const,
            href: '/dashboard/connections',
          },
          {
            label: 'Credentials Issued',
            value: stats?.credentials?.total || 0,
            foot: `${stats?.credentials?.issued || 0} issued`,
            icon: 'badge' as const,
            href: '/dashboard/credentials',
          },
          {
            label: 'Pending Proofs',
            value: stats?.invitations?.pending || 0,
            foot: 'awaiting verification',
            icon: 'shieldCheck' as const,
            href: '/dashboard/proofs',
          },
          {
            label: 'DIDs Registered',
            value: stats?.dids?.total || 0,
            foot: 'across all methods',
            icon: 'fingerprint' as const,
            href: '/dashboard/dids',
          },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="stat" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="stat-row">
              <span className="stat-label">{s.label}</span>
              <span className="stat-icon"><Icon name={s.icon} size={14} /></span>
            </div>
            {isLoading ? (
              <div style={{ height: 36, background: 'var(--bg-sunk)', borderRadius: 6, marginTop: 8, width: 60 }} />
            ) : (
              <div className="stat-value">{s.value}</div>
            )}
            <div className="stat-foot">{s.foot}</div>
          </Link>
        ))}
      </div>

      {/* Section: Quick Actions */}
      <div className="section-title">Quick Actions</div>
      <div className="qa-grid" style={{ marginBottom: 28 }}>
        <Link href="/dashboard/oid4vci" className="qa">
          <div className="qa-icon green"><Icon name="send" size={16} /></div>
          <div className="qa-text">
            <div className="qa-title">Issue Credential</div>
            <div className="qa-desc">Send a verifiable credential offer</div>
          </div>
          <span className="qa-chev"><Icon name="chevRight" size={14} /></span>
        </Link>
        <Link href="/dashboard/proofs" className="qa">
          <div className="qa-icon amber"><Icon name="shieldCheck" size={16} /></div>
          <div className="qa-text">
            <div className="qa-title">Request Proof</div>
            <div className="qa-desc">Verify credentials selectively</div>
          </div>
          <span className="qa-chev"><Icon name="chevRight" size={14} /></span>
        </Link>
        <Link href="/dashboard/workflows" className="qa">
          <div className="qa-icon violet"><Icon name="workflow" size={16} /></div>
          <div className="qa-text">
            <div className="qa-title">Start Workflow</div>
            <div className="qa-desc">Run a multi-step exchange template</div>
          </div>
          <span className="qa-chev"><Icon name="chevRight" size={14} /></span>
        </Link>
      </div>
    </div>
  );
}
