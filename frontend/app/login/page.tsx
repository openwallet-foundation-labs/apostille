'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import { Icon, ErrorIcon } from '../components/ui/Icons';

const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Apostille';
const COMPANY_SUB = process.env.NEXT_PUBLIC_COMPANY_SUBTITLE || 'Credential Management System';
const COMPANY_TAGLINE = process.env.NEXT_PUBLIC_COMPANY_TAGLINE || 'Identity infrastructure that holders, issuers, and verifiers can actually trust.';
const COMPANY_DESC = process.env.NEXT_PUBLIC_COMPANY_DESCRIPTION || 'DIDComm, OID4VC, mDoc, AnonCreds — one console for every credential format your operators ship today.';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error('Email and password are required');
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }
      await login({ email, password });
    } catch (error: any) {
      setError(error.message || 'Failed to login. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-shell">
      {/* Left pane — form */}
      <div className="login-pane">
        <div className="login-form">
          {/* Brand */}
          <div className="login-brand">
            <div className="login-brand-mark">
              {COMPANY_NAME.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                {COMPANY_NAME}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono, monospace)' }}>
                {COMPANY_SUB}
              </div>
            </div>
          </div>

          <h1 className="login-h">Welcome back</h1>
          <p className="login-sub">Sign in to your tenant workspace.</p>

          {/* Error */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <ErrorIcon className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-fields">
            {/* Email */}
            <div className="field">
              <label htmlFor="email" className="field-label">Email</label>
              <div className="login-input-wrap">
                <span className="lead">
                  <Icon name="mail" size={15} />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label htmlFor="password" className="field-label">Password</label>
                <Link href="/forgot-password" className="login-link" style={{ fontSize: 12 }}>
                  Forgot?
                </Link>
              </div>
              <div className="login-input-wrap">
                <span className="lead">
                  <Icon name="lock" size={15} />
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="trail-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={14} />
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="login-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" id="remember-me" name="remember-me" style={{ accentColor: 'var(--accent)' }} />
                <span style={{ color: 'var(--ink-2)' }}>Keep me signed in</span>
              </label>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isLoading} className="login-btn">
              {isLoading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }}></span>
                  Signing in...
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <Icon name="arrowRight" size={14} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-foot">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="login-link">Create a workspace</Link>
          </div>
        </div>
      </div>

      {/* Right pane — branded aside */}
      <div className="login-aside">
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: '11.5px', fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--sidebar-ink-3)', letterSpacing: 0, marginBottom: 48,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            {COMPANY_NAME.toUpperCase()} / CrMS
          </div>
          <h2 className="login-aside-h">
            {COMPANY_TAGLINE.split(/(\bholders, issuers, and verifiers\b)/i).map((part, i) =>
              /holders, issuers, and verifiers/i.test(part)
                ? <em key={i}>{part}</em>
                : part
            )}
          </h2>
          <p className="login-aside-sub">{COMPANY_DESC}</p>

          {/* Platform capabilities */}
          <div className="spec-grid">
            <div className="spec-cell">
              <div className="spec-cell-label">Credential Formats</div>
              <div className="spec-cell-val">3 native</div>
              <div className="spec-cell-meta">anoncreds &middot; oid4vc &middot; mso_mdoc</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell-label">Encryption</div>
              <div className="spec-cell-val">PQ-Ready</div>
              <div className="spec-cell-meta">ML-KEM 768 &middot; X25519</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell-label">Protocols</div>
              <div className="spec-cell-val">DIDComm v2</div>
              <div className="spec-cell-meta">OID4VCI &middot; OID4VP</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell-label">DID Methods</div>
              <div className="spec-cell-val">4 supported</div>
              <div className="spec-cell-meta">web &middot; key &middot; peer &middot; kanon</div>
            </div>
          </div>

          {/* Feature highlights */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
            <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sidebar-ink-3)', marginBottom: 2 }}>
              Platform Capabilities
            </div>
            {[
              { icon: 'vault', label: 'Quantum-Safe Vaults', desc: 'ML-KEM-768 encrypted document storage' },
              { icon: 'fileSig', label: 'Multi-Party PDF Signing', desc: 'Field placement, guided signing, threshold signatures' },
              { icon: 'workflow', label: 'Workflow Engine', desc: 'Visual state machine builder with DIDComm notifications' },
              { icon: 'phone', label: 'Encrypted Calls', desc: 'WebRTC video/audio with TURN server support' },
              { icon: 'award', label: 'OpenBadges 3.0', desc: 'Issue and verify Credly-compatible badges' },
              { icon: 'shieldCheck', label: 'Zero-Knowledge Proofs', desc: 'Proof of execution with selective disclosure' },
            ].map((feat) => (
              <div key={feat.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)',
                  display: 'grid', placeItems: 'center',
                  color: 'var(--sidebar-ink-2)',
                }}>
                  <Icon name={feat.icon as any} size={14} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sidebar-ink)', lineHeight: 1.2 }}>
                    {feat.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--sidebar-ink-3)', marginTop: 2, lineHeight: 1.3 }}>
                    {feat.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="login-foot-spec">
          <span>&copy; {new Date().getFullYear()} {COMPANY_NAME}</span>
          <span style={{ display: 'flex', gap: 16 }}>
            <Link href="/privacy-policy">Privacy</Link>
            <span>Terms</span>
            <span>Status &middot;{' '}
              <span style={{ color: 'var(--green)' }}>&#9679; operational</span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
