'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SecurityIcon, EmailIcon, ErrorIcon, SuccessIcon } from '../components/ui/Icons';
import { runtimeConfig } from '../../lib/runtimeConfig';

const API_BASE_URL = runtimeConfig.API_URL;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!email.trim()) {
        throw new Error('Email is required');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send reset email');
      }

      setSuccess(data.message || 'If an account with that email exists, a password reset link has been sent.');
      setEmail('');
    } catch (error: any) {
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center animate-fade-in">
          <div className="auth-icon">
            <SecurityIcon className="w-6 h-6" />
          </div>
          <h2 className="text-3xl font-bold text-text-primary mb-2">
            Forgot your password?
          </h2>
          <p className="text-text-secondary">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {/* Main Card */}
        <div className="card animate-slide-in content-padding">
          {/* Error Alert */}
          {error && (
            <div className="alert alert-error mb-6">
              <ErrorIcon className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="alert alert-success mb-6">
              <SuccessIcon className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Form */}
          {!success && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <EmailIcon className="h-5 w-5 text-text-tertiary" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="input pl-10"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full"
              >
                {isLoading ? (
                  <>
                    <span className="spinner h-5 w-5 mr-2"></span>
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          )}

          {/* Back to login after success */}
          {success && (
            <div className="text-center">
              <Link
                href="/login"
                className="btn btn-primary w-full"
              >
                Back to Login
              </Link>
            </div>
          )}
        </div>

        {/* Back to login link */}
        <div className="text-center animate-fade-in">
          <p className="text-sm text-text-secondary">
            Remember your password?{' '}
            <Link
              href="/login"
              className="font-medium text-primary-600 hover:text-primary-500 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
