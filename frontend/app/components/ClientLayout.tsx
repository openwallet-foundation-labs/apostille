'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from './ThemeProvider';
import { Icon, CloseIcon, MenuIcon } from './ui/Icons';

interface ClientLayoutProps {
  children: ReactNode;
}

// Navigation structure matching the design system's 5 grouped sections
const NAV_SECTIONS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'home' },
      { href: '/dashboard/connections', label: 'Connections', icon: 'link' },
      { href: '/dashboard/credentials', label: 'Credentials', icon: 'badge' },
      { href: '/dashboard/proofs', label: 'Proofs', icon: 'shieldCheck' },
    ],
  },
  {
    title: 'Identity',
    items: [
      { href: '/dashboard/dids', label: 'DIDs', icon: 'fingerprint' },
      { href: '/dashboard/schemas', label: 'Schemas', icon: 'database' },
      { href: '/dashboard/credential-definitions', label: 'Credential Definitions', icon: 'layers' },
      { href: '/dashboard/credential-designer', label: 'Card Designer', icon: 'cards' },
    ],
  },
  {
    title: 'Issuance & Verify',
    items: [
      { href: '/dashboard/oid4vci', label: 'Issue (OID4VCI)', icon: 'send' },
      { href: '/dashboard/oid4vp', label: 'Verify (OID4VP)', icon: 'fileCheck' },
      { href: '/dashboard/workflows', label: 'Workflows', icon: 'workflow' },
    ],
  },
  {
    title: 'Documents',
    items: [
      { href: '/dashboard/signing', label: 'Signing', icon: 'pen' },
      { href: '/dashboard/pdf-signing', label: 'PDF Signing', icon: 'fileSig' },
      { href: '/dashboard/vaults', label: 'Vaults', icon: 'vault' },
    ],
  },
  {
    title: 'Communicate',
    items: [
      { href: '/dashboard/calls', label: 'Calls', icon: 'phone' },
      { href: '/dashboard/calendar', label: 'Calendar', icon: 'calendar' },
      { href: '/dashboard/badges', label: 'OpenBadges', icon: 'award' },
      { href: '/dashboard/poe', label: 'Proof of Execution', icon: 'log' },
    ],
  },
];

// Flat list for page title lookup
const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Apostille';

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { isAuthenticated, isLoading, logout, tenantId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublicPage = pathname === '/login' || pathname === '/signup' || pathname === '/privacy-policy';
  const availableForBothPublicAndProtectedRoutes = pathname.includes('wallet');
  const isFullScreenPage = pathname.startsWith('/dashboard/credential-designer/') && pathname !== '/dashboard/credential-designer';

  useEffect(() => {
    if (isLoading) return;
    if (availableForBothPublicAndProtectedRoutes) return;
    if (isFullScreenPage && isAuthenticated) return;
    if (isAuthenticated && isPublicPage) {
      router.push('/dashboard');
    } else if (!isAuthenticated && !isPublicPage) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, isPublicPage, isFullScreenPage, availableForBothPublicAndProtectedRoutes, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center animate-fade-in">
          <div className="spinner h-10 w-10 mx-auto mb-4"></div>
          <p style={{ color: 'var(--ink-3)', fontSize: '13px' }}>Loading application...</p>
        </div>
      </div>
    );
  }

  if (availableForBothPublicAndProtectedRoutes) {
    return <div>{children}</div>;
  }

  if (isFullScreenPage && isAuthenticated) {
    return <div className="h-screen overflow-hidden">{children}</div>;
  }

  if (isPublicPage) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }}>{children}</div>;
  }

  // Get current page info for breadcrumbs
  const currentPage = ALL_NAV_ITEMS.find(item => item.href === pathname);
  const currentSection = NAV_SECTIONS.find(s => s.items.some(i => i.href === pathname));
  const pageTitle = currentPage?.label || 'Dashboard';
  const sectionTitle = currentSection?.title || 'Workspace';

  if (isAuthenticated) {
    return (
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
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
          fixed inset-y-0 left-0 z-50 w-[248px] transform transition-transform duration-300
          lg:translate-x-0 lg:static lg:inset-0 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full sidebar">
            {/* Brand */}
            <div className="sb-brand" style={{
              padding: '20px 18px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderBottom: '1px solid var(--border-sidebar)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: 'linear-gradient(135deg, oklch(0.65 0.18 250), oklch(0.50 0.16 250))',
                display: 'grid', placeItems: 'center',
                color: 'white', fontWeight: 700, fontSize: 14,
                letterSpacing: '-0.04em',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
              }}>
                {COMPANY_NAME.charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--sidebar-ink)', letterSpacing: '-0.01em' }}>
                  {COMPANY_NAME}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sidebar-ink-3)', fontFamily: 'var(--font-mono, monospace)' }}>
                  Credential Platform
                </div>
              </div>
              {/* Mobile close */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden ml-auto"
                style={{ color: 'var(--sidebar-ink-2)' }}
                aria-label="Close sidebar"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Tenant info */}
            {tenantId && (
              <div style={{
                margin: '12px 12px 4px',
                padding: '10px 12px',
                background: 'var(--bg-sidebar-hover)',
                border: '1px solid var(--border-sidebar)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  background: 'linear-gradient(135deg, oklch(0.7 0.14 200), oklch(0.55 0.15 280))',
                }} />
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--sidebar-ink)', fontWeight: 500 }}>
                    Tenant
                  </div>
                  <div style={{
                    fontSize: '10.5px', color: 'var(--sidebar-ink-3)',
                    fontFamily: 'var(--font-mono, monospace)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {tenantId.slice(0, 8)}...{tenantId.slice(-6)}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <nav style={{
              flex: 1, padding: '8px 10px',
              overflowY: 'auto',
              scrollbarWidth: 'thin' as const,
            }}>
              {NAV_SECTIONS.map((section) => (
                <div key={section.title}>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    color: 'var(--sidebar-ink-3)',
                    padding: '14px 10px 6px',
                  }}>
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 10px', borderRadius: 6,
                          color: isActive ? 'var(--sidebar-ink)' : 'var(--sidebar-ink-2)',
                          fontSize: 13, fontWeight: isActive ? 500 : 450,
                          background: isActive ? 'var(--bg-sidebar-hover)' : 'transparent',
                          transition: 'background 0.12s, color 0.12s',
                          position: 'relative' as const,
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'var(--bg-sidebar-hover)';
                            e.currentTarget.style.color = 'var(--sidebar-ink)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--sidebar-ink-2)';
                          }
                        }}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <div style={{
                            position: 'absolute', left: -10, top: 7, bottom: 7,
                            width: 2, background: 'var(--accent)',
                            borderRadius: '0 2px 2px 0',
                          }} />
                        )}
                        <Icon
                          name={item.icon as any}
                          className={isActive ? '' : ''}
                          size={16}
                        />
                        <span style={{ flex: 1 }}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div style={{
              padding: 12,
              borderTop: '1px solid var(--border-sidebar)',
              display: 'flex', flexDirection: 'column' as const, gap: 8,
            }}>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={logout}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 10px', borderRadius: 6, fontSize: 12,
                    color: 'var(--sidebar-ink-2)',
                    background: 'var(--bg-sidebar-hover)',
                    border: '1px solid var(--border-sidebar)',
                    transition: 'all 0.15s', cursor: 'pointer',
                  }}
                >
                  <Icon name="logout" size={13} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header style={{
            height: 60,
            borderBottom: '1px solid var(--border)',
            background: 'var(--topbar-blur)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center',
            padding: '0 32px', gap: 20,
            position: 'sticky' as const, top: 0, zIndex: 10,
          }}>
            {/* Breadcrumbs */}
            <div className="crumbs hidden sm:flex">
              <span>{sectionTitle}</span>
              <span className="sep">
                <Icon name="chevRight" size={12} />
              </span>
              <span className="cur">{pageTitle}</span>
            </div>

            {/* Search */}
            <div style={{
              marginLeft: 24, flex: 1, maxWidth: 360,
              position: 'relative' as const,
            }} className="hidden md:block">
              <input
                type="text"
                placeholder="Search connections, credentials, DIDs..."
                style={{
                  width: '100%', height: 32,
                  padding: '0 12px 0 32px',
                  background: 'var(--bg-elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 13,
                  outline: 'none', color: 'var(--ink)',
                }}
              />
              <Icon name="search" size={14} className="absolute left-[10px] top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
              <kbd style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: '10.5px', fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--ink-4)', background: 'var(--bg-sunk)',
                border: '1px solid var(--border)',
                borderRadius: 3, padding: '1px 5px',
              }}>
                ⌘K
              </kbd>
            </div>

            {/* Right actions */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ThemeToggle />
              {/* Notifications */}
              {(() => {
                try {
                  const Bell = require('./NotificationBell').default;
                  return <Bell />;
                } catch {
                  return null;
                }
              })()}
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
            <div style={{ padding: '28px 32px 80px', maxWidth: 1280, margin: '0 auto' }}>
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
