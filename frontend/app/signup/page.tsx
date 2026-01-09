'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLoading]);

  const isStrongPassword = (pw: string) => {
    const hasUpper = /[A-Z]/.test(pw);
    const hasSpecialOrDigit = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]|\d/.test(pw);
    return hasUpper && hasSpecialOrDigit;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setDebugInfo(null);

    try {
      // Basic validation
      if (!label.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
        throw new Error('All fields are required');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      // Password strength validation
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (!isStrongPassword(password)) {
        throw new Error(
          'Password must contain at least one uppercase letter, number and  special character'
        );
      }

      // Register the tenant with label, email and password
      const newTenantId = await register({
        label,
        email,
        password
      });

      // Save the tenant ID to display
      setTenantId(newTenantId);
      setIsRegistered(true);

    } catch (error: any) {
      setError(error.message || 'Failed to register tenant. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tenantId);
    alert('Tenant ID copied to clipboard!');
  };

  const goToLogin = () => {
    router.push('/login');
  };

  const DebugInfo = () => {
    if (!debugInfo) return null;

    return (
      <div className="mt-4 p-3 bg-surface-200 rounded-lg border border-border-primary text-xs">
        <h4 className="font-semibold text-text-primary">Debug Info:</h4>
        <pre className="mt-1 overflow-auto max-h-24 text-text-secondary font-mono">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>
    );
  };

  if (isRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="auth-card">
          <div className="text-center">
            <div className="auth-icon bg-success-100 text-success-600">
              <svg
                className="h-8 w-8"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="auth-title">Registration Successful!</h2>
            <p className="auth-subtitle">
              Your wallet has been created. Make sure to save your tenant ID.
            </p>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between p-4 bg-surface-200 rounded-lg border border-border-primary">
              <span className="text-sm font-medium text-text-primary break-all font-mono">{tenantId}</span>
              <button
                onClick={copyToClipboard}
                className="ml-2 p-2 text-text-secondary hover:text-text-primary transition-colors duration-200"
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              This is your unique tenant ID. You'll need it to log in if you ever lose your session.
            </p>
          </div>

          <div className="mt-8">
            <button
              onClick={goToLogin}
              className="btn btn-primary w-full"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary">
      <div className="auth-card">
        <div className="text-center mb-8">
          <div className="auth-icon">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="auth-title">Create a new wallet</h2>
          <p className="auth-subtitle">
            Already have a wallet?{' '}
            <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {error && (
          <div className="alert alert-error mb-6">
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="wallet-label" className="input-label">
                Wallet Label
              </label>
              <input
                id="wallet-label"
                name="label"
                type="text"
                required
                className="input"
                placeholder="Enter a name for your wallet"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <p className="input-helper">This name will be used to identify your wallet.</p>
            </div>

            <div>
              <label htmlFor="email-address" className="input-label">
                Email Address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="input-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="input"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="input-helper">Password must be at least 6 characters long.</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="input-label">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="input"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <span className="spinner h-5 w-5 mr-3"></span>
                  Creating wallet...
                </>
              ) : (
                'Create wallet'
              )}
            </button>
          </div>
        </form>

        <DebugInfo />
      </div>
    </div>
  );
} 