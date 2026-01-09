'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { apiPost, DashboardStats } from '../utils/api';
import CreateInvitation from '../components/CreateInvitation';
import Link from 'next/link';
import { PlusIcon, ConnectionsIcon, CredentialsIcon, ProofsIcon, DIDsIcon, SecurityIcon, ErrorIcon } from '../components/ui/Icons';
import { useNotifications } from '../context/NotificationContext';

export default function DashboardPage() {
  const { tenantId, token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvitationPanel, setShowInvitationPanel] = useState(false);

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

  // Initial load
  useEffect(() => {
    void requestStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Event-driven refresh: debounce on incoming WS notifications
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

  const quickActions = [
    {
      name: 'Create Connection',
      description: 'Establish a new secure connection',
      href: '/connections',
      icon: <PlusIcon className="w-6 h-6" />,
      color: 'primary'
    },
    {
      name: 'View Credentials',
      description: 'Manage your digital credentials',
      href: '/credentials',
      icon: <CredentialsIcon className="w-6 h-6" />,
      color: 'success'
    },
    {
      name: 'Request Proof',
      description: 'Verify credentials securely',
      href: '/proofs',
      icon: <SecurityIcon className="w-6 h-6" />,
      color: 'warning'
    },
  ];

  const statsCards = [
    {
      name: 'Active Connections',
      value: stats?.connections?.total || 0,
      subtitle: stats?.connections?.active ? `${stats.connections.active} active` : undefined,
      href: '/connections',
      icon: <ConnectionsIcon className="w-8 h-8" />,
      color: 'primary'
    },
    {
      name: 'Credentials',
      value: stats?.credentials?.total || 0,
      subtitle: stats?.credentials?.issued ? `${stats.credentials.issued} issued` : undefined,
      href: '/credentials',
      icon: <CredentialsIcon className="w-8 h-8" />,
      color: 'success'
    },
    {
      name: 'Proof Requests',
      value: stats?.invitations?.pending || 0,
      subtitle: 'pending verifications',
      href: '/proofs',
      icon: <ProofsIcon className="w-8 h-8" />,
      color: 'warning'
    },
    {
      name: 'DIDs',
      value: 0,
      subtitle: 'View DID records',
      href: '/dids',
      icon: <DIDsIcon className="w-8 h-8" />,
      color: 'gray'
    },
  ];

  return (
          <div className="space-y-8">
      {/* Welcome Section */}
      <div className="glass content-padding">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-4 lg:mb-0">
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Welcome back!
            </h1>
            {stats?.tenant ? (
              <div className="space-y-1">
                <p className="text-lg text-text-secondary">
                  <span className="font-semibold text-primary-600">{stats.tenant.label || 'Your Organization'}</span>
                </p>
                <p className="text-sm text-text-tertiary font-mono">
                  Tenant ID: {stats.tenant.id}
                </p>
              </div>
            ) : tenantId ? (
              <p className="text-lg text-text-secondary">
                Tenant ID: <span className="font-semibold text-primary-600 font-mono">{tenantId}</span>
              </p>
            ) : (
              <p className="text-lg text-text-tertiary">Loading tenant information...</p>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowInvitationPanel(!showInvitationPanel)}
              className="btn btn-primary"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Create Invitation
            </button>
            <Link href="/connections" className="btn btn-secondary">
              View All Connections
            </Link>
          </div>
        </div>
      </div>
      
      {/* Error Alert */}
      {error && (
        <div className="alert alert-error animate-slide-in">
          <ErrorIcon className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat) => {
          const colorClasses = {
            primary: 'text-primary-600 bg-primary-100',
            success: 'text-success-600 bg-success-100',
            warning: 'text-warning-600 bg-warning-100',
            gray: 'text-text-secondary bg-surface-100 dark:bg-surface-700'
          };

          return (
            <Link key={stat.name} href={stat.href} className="card card-interactive group content-padding">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-secondary mb-1">{stat.name}</p>
                  {isLoading ? (
                    <div className="animate-pulse">
                      <div className="h-8 bg-surface-300 rounded w-16 mb-2"></div>
                      <div className="h-4 bg-surface-300 rounded w-20"></div>
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-text-primary mb-2">{stat.value.toLocaleString()}</p>
                      {stat.subtitle && (
                        <p className="text-xs text-text-tertiary">
                          {stat.subtitle}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className={`p-3 rounded-xl ${colorClasses[stat.color as keyof typeof colorClasses]} group-hover:scale-110 transition-transform duration-200`}>
                  {stat.icon}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      
      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const colorClasses = {
              primary: 'border-primary-200 hover:border-primary-300 hover:bg-primary-50',
              success: 'border-success-200 hover:border-success-300 hover:bg-success-50',
              warning: 'border-warning-200 hover:border-warning-300 hover:bg-warning-50'
            };

            return (
              <Link
                key={action.name}
                href={action.href}
                className={`
                  card card-interactive content-padding border-2 group
                  ${colorClasses[action.color as keyof typeof colorClasses]}
                `}
              >
                <div className="flex items-start space-x-4">
                  <div className={`
                    p-3 rounded-lg transition-colors duration-200
                    ${action.color === 'primary' ? 'text-primary-600 bg-primary-100 group-hover:bg-primary-200' : ''}
                    ${action.color === 'success' ? 'text-success-600 bg-success-100 group-hover:bg-success-200' : ''}
                    ${action.color === 'warning' ? 'text-warning-600 bg-warning-100 group-hover:bg-warning-200' : ''}
                  `}>
                    {action.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-text-primary group-hover:text-primary-700 transition-colors duration-200">
                      {action.name}
                    </h3>
                    <p className="text-sm text-text-secondary mt-1">
                      {action.description}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-text-tertiary group-hover:text-primary-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Invitation Panel */}
      {showInvitationPanel && tenantId && (
        <div className="animate-slide-in">
          <CreateInvitation tenantId={tenantId} />
        </div>
      )}
    </div>
  );
} 
