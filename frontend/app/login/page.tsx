'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import { SecurityIcon, EmailIcon, LockIcon, EyeIcon, EyeOffIcon, ErrorIcon, LoginIcon, LightningIcon } from '../components/ui/Icons';

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
      
      // Basic email validation
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
    <div className="min-h-screen flex items-center justify-center bg-secondary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center animate-fade-in">
          <div className="mx-auto h-16 w-16 bg-primary-600 rounded-2xl flex items-center justify-center mb-6 shadow-apple">
            <SecurityIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-text-primary mb-2">
            Welcome back
          </h2>
          <p className="text-text-secondary">
            Sign in to your Credo account
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
          
          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Email Field */}
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

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockIcon className="h-5 w-5 text-text-tertiary" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="input pl-10 pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5 text-text-tertiary hover:text-text-primary transition-colors" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-text-tertiary hover:text-text-primary transition-colors" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Remember me and Forgot password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border-primary rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-text-secondary">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full relative"
            >
              {isLoading ? (
                <>
                  <span className="spinner h-5 w-5 mr-2"></span>
                  Signing in...
                </>
              ) : (
                <>
                  <LoginIcon className="w-5 h-5 mr-2" />
                  Sign in
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <div className="text-center animate-fade-in">
          <p className="text-sm text-text-secondary">
            Don't have an account?{' '}
            <Link 
              href="/signup" 
              className="font-medium text-primary-600 hover:text-primary-500 transition-colors"
            >
              Create one now
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-text-tertiary space-y-2 animate-fade-in">
          <p>Secured by advanced encryption</p>
          <div className="flex items-center justify-center space-x-4 text-xs">
            <Link href="/privacy" className="hover:text-text-secondary transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-text-secondary transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 