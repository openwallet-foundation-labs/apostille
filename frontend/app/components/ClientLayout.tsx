'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from './ThemeProvider';
import { 
  DashboardIcon, 
  ConnectionsIcon, 
  CredentialsIcon, 
  ProofsIcon, 
  DIDsIcon, 
  SchemasIcon, 
  CredentialDefinitionsIcon,
  MenuIcon,
  CloseIcon,
  LogoutIcon,
  LightningIcon
} from './ui/Icons';

interface ClientLayoutProps {
  children: ReactNode;
}

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />
  },
  {
    href: '/dashboard/connections',
    label: 'Connections',
    icon: <ConnectionsIcon />
  },
  {
    href: '/dashboard/credentials',
    label: 'Credentials',
    icon: <CredentialsIcon />
  },
  {
    href: '/dashboard/proofs',
    label: 'Proofs',
    icon: <ProofsIcon />
  },
  {
    href: '/dashboard/dids',
    label: 'DIDs',
    icon: <DIDsIcon />
  },
  {
    href: '/dashboard/schemas',
    label: 'Schemas',
    icon: <SchemasIcon />
  },
  {
    href: '/dashboard/credential-definitions',
    label: 'Credential Definitions',
    icon: <CredentialDefinitionsIcon />
  },
  {
    href: '/dashboard/oid4vci',
    label: 'Issue (OID4VCI)',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
    </svg>
  },
  {
    href: '/dashboard/oid4vp',
    label: 'Verify (OID4VP)',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  },
  {
    href: '/dashboard/workflows',
    label: 'Workflows',
    icon: <LightningIcon />
  },
  {
    href: '/dashboard/signing',
    label: 'Signing',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  },
  {
    href: '/dashboard/vaults',
    label: 'Vaults',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  },
  {
    href: '/dashboard/pdf-signing',
    label: 'PDF Signing',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  },
  {
    href: '/dashboard/groups',
    label: 'Groups',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  },
  {
    href: '/dashboard/groups/join',
    label: 'Join Group',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  },
  {
    href: '/dashboard/poe',
    label: 'Proof of Execution',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  },
  {
    href: '/dashboard/badges',
    label: 'OpenBadges',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  },
  {
    href: '/dashboard/credential-designer',
    label: 'Card Designer',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  },
];

// Get environment variables with defaults
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Apostille';
const COMPANY_LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL || '/logo.png';

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const isPublicPage = pathname === '/login' || pathname === '/signup' || pathname === '/privacy-policy';

  const availableForBothPublicAndProtectedRoutes = pathname.includes('wallet');

  // Full-screen pages that should not have dashboard chrome (sidebar, header)
  const isFullScreenPage = pathname.startsWith('/dashboard/credential-designer/') && pathname !== '/dashboard/credential-designer';

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if(availableForBothPublicAndProtectedRoutes){
      return;
    }
    // Full-screen pages require authentication but skip redirect logic for authenticated users
    if (isFullScreenPage && isAuthenticated) {
      return;
    }
    if (isAuthenticated && isPublicPage) {
      router.push('/dashboard');
    } else if (!isAuthenticated && !isPublicPage) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, isPublicPage, isFullScreenPage, availableForBothPublicAndProtectedRoutes, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-secondary">
        <div className="text-center animate-fade-in">
          <div className="spinner h-12 w-12 mx-auto mb-4"></div>
          <p className="text-text-secondary font-medium">Loading application...</p>
          <p className="text-text-tertiary text-sm mt-2">Preparing your secure workspace</p>
        </div>
      </div>
    );
  }

  if(availableForBothPublicAndProtectedRoutes){
    return <div>{children}</div>
  }

  // Full-screen pages like credential designer editor - no dashboard chrome
  if (isFullScreenPage && isAuthenticated) {
    return <div className="h-screen overflow-hidden">{children}</div>;
  }

  if (isPublicPage) {
    return <div className="min-h-screen bg-secondary">{children}</div>;
  }

  if (isAuthenticated) {
    return (
      <div className="flex h-screen bg-secondary overflow-hidden">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="fixed inset-0 bg-black/50" />
          </div>
        )}

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-80 transform transition-all duration-500 ease-out
          lg:translate-x-0 lg:static lg:inset-0 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full bg-primary relative overflow-hidden">
            {/* Elegant gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-black/[0.04] pointer-events-none"></div>
            <div className="absolute inset-0 backdrop-blur-xl bg-surface-50/95 dark:bg-surface-100/95"></div>
            
            {/* Subtle border */}
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-border-primary/60 to-transparent"></div>

            {/* Header */}
            <div className="relative px-8 py-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {COMPANY_LOGO_URL && (
                    <div className="relative group">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden from-primary-500 to-primary-600 shadow-apple-lg p-0.5">
                        <div className="w-full h-full rounded-2xl overflow-hidden bg-white dark:bg-surface-100 flex items-center justify-center">
                          <Image
                            src={COMPANY_LOGO_URL}
                            alt={COMPANY_NAME}
                            width={36}
                            height={36}
                            className="object-contain transition-transform duration-300 group-hover:scale-110"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-text-primary tracking-tight">{COMPANY_NAME}</h1>
                    <p className="text-sm text-text-tertiary font-medium">Credential Platform</p>
                  </div>
                </div>
                
                {/* Mobile close button */}
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded-xl transition-all duration-200"
                  aria-label="Close sidebar"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 overflow-y-auto">
              <div className="space-y-1">
                {/* Quick nav item to Calls page */}
                <Link
                  href="/dashboard/calls"
                  onClick={() => setSidebarOpen(false)}
                  className={`${pathname === '/dashboard/calls'
                      ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-apple-lg relative z-10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-200/80 dark:hover:bg-surface-300/50'}
                      group relative flex items-center px-5 py-4 text-sm font-semibold rounded-2xl
                      transition-all duration-300 ease-out transform hover:scale-[1.02] active:scale-[0.98]`}
                >
                  <div className={`${pathname === '/dashboard/calls' ? 'bg-white/20 text-white shadow-sm' : 'text-text-tertiary group-hover:text-primary-600 group-hover:bg-primary-50'}
                    relative flex items-center justify-center w-7 h-7 mr-4 rounded-lg transition-all duration-300 z-20`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <span className="flex-1 tracking-wide font-medium relative z-20">Calls</span>
                </Link>
                {navItems.map((item, index) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link 
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        group relative flex items-center px-5 py-4 text-sm font-semibold rounded-2xl
                        transition-all duration-300 ease-out transform hover:scale-[1.02] active:scale-[0.98]
                        ${isActive 
                          ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-apple-lg relative z-10' 
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-200/80 dark:hover:bg-surface-300/50'
                        }
                      `}
                      style={{
                        animationDelay: `${index * 75}ms`
                      }}
                    >
                      {/* Icon container */}
                      <div className={`
                        relative flex items-center justify-center w-7 h-7 mr-4 rounded-lg
                        transition-all duration-300 z-20
                        ${isActive 
                          ? 'bg-white/20 text-white shadow-sm' 
                          : 'text-text-tertiary group-hover:text-primary-600 group-hover:bg-primary-50'
                        }
                      `}>
                        <span className="text-base transition-transform duration-300 group-hover:scale-110 relative z-30">
                          {item.icon}
                        </span>
                        {isActive && (
                          <div className="absolute inset-0 bg-white/10 rounded-lg animate-pulse-subtle z-10"></div>
                        )}
                      </div>
                      
                      {/* Label */}
                      <span className="flex-1 tracking-wide font-medium relative z-20">
                        {item.label}
                      </span>
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div className="flex items-center space-x-2 relative z-20">
                          <div className="w-1.5 h-1.5 bg-white/90 rounded-full animate-pulse"></div>
                          <div className="w-1 h-1 bg-white/60 rounded-full"></div>
                        </div>
                      )}
                      
                      {/* Hover effect overlay */}
                      {!isActive && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-500/0 to-primary-600/0 group-hover:from-primary-500/5 group-hover:to-primary-600/8 transition-all duration-300 z-0"></div>
                      )}
                    </Link>
                  );
                })}
              </div>
              
              {/* Elegant section divider */}
              <div className="my-8 px-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gradient-to-r from-transparent via-border-primary/30 to-transparent"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-primary px-4 text-xs font-bold text-text-tertiary uppercase tracking-widest">
                      Quick Actions
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Quick actions */}
              <div className="space-y-2">
                <Link
                  href="/dashboard/connections"
                  onClick={() => setSidebarOpen(false)}
                  className="group w-full flex items-center px-5 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-200/60 rounded-xl transition-all duration-200 transform hover:scale-[1.01]"
                >
                  <div className="w-6 h-6 mr-4 flex items-center justify-center rounded-lg bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400 group-hover:scale-110 transition-transform duration-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <span className="font-semibold">New Connection</span>
                </Link>

                <Link
                  href="/dashboard/oid4vci"
                  onClick={() => setSidebarOpen(false)}
                  className="group w-full flex items-center px-5 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-200/60 rounded-xl transition-all duration-200 transform hover:scale-[1.01]"
                >
                  <div className="w-6 h-6 mr-4 flex items-center justify-center rounded-lg bg-info-100 dark:bg-info-900/30 text-info-600 dark:text-info-400 group-hover:scale-110 transition-transform duration-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <span className="font-semibold">Issue Credential</span>
                </Link>
              </div>
            </nav>

            {/* Footer */}
            <div className="relative px-6 py-6 border-t border-border-primary/20 bg-surface-100/50 dark:bg-surface-200/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">Settings</span>
                </div>
                <ThemeToggle />
              </div>
              
              <button 
                onClick={logout} 
                className="group w-full flex items-center justify-center px-5 py-4 text-sm font-bold text-error-600 hover:text-white bg-error-50 hover:bg-error-600 dark:bg-error-900/20 dark:hover:bg-error-600 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-error-500 to-error-600 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <LogoutIcon className="relative w-5 h-5 mr-3 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-12" />
                <span className="relative font-bold tracking-wide">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="relative bg-primary backdrop-blur-xl border-b border-border-primary/30 px-6 py-5 lg:px-8">
            <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent pointer-events-none"></div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-6">
                {/* Mobile menu button */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-3 text-text-secondary hover:text-text-primary hover:bg-surface-200/80 rounded-2xl transition-all duration-200 transform hover:scale-110 active:scale-95"
                  aria-label="Open sidebar"
                >
                  <MenuIcon />
                </button>
                
                {/* Page title with enhanced styling */}
                <div className="flex items-center space-x-4">
                  <div className="hidden sm:block w-1 h-12 bg-gradient-to-b from-primary-500 to-primary-700 rounded-full"></div>
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary tracking-tight">
                      {navItems.find(item => item.href === pathname)?.label || 'Dashboard'}
                    </h2>
                    <p className="text-sm text-text-secondary font-medium mt-1">
                      Manage your credentials and connections securely
                    </p>
                  </div>
                </div>
              </div>

              {/* Desktop actions */}
              <div className="hidden lg:flex items-center space-x-4">
                {/* Status indicator */}
                <div className="flex items-center space-x-2 px-3 py-2 bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 rounded-xl">
                  <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold">System Online</span>
                </div>
                {/* Notifications */}
                {(() => {
                  const Bell = require('./NotificationBell').default
                  return <Bell />
                })()}
                {/* <ThemeToggle /> */}
              </div>
            </div>
          </header>

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto main-content relative">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.01]">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.15) 1px, transparent 0)`,
                backgroundSize: '20px 20px'
              }}></div>
            </div>
            
            <div className="relative content-padding max-w-7xl mx-auto">
              <div className="animate-fade-in">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return null;
} 
