'use client';

import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { openbadgesApi } from '@/lib/api';

interface VerifyBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VerificationResult {
  verified: boolean;
  error?: string;
  issuer?: {
    id: string;
    name?: string;
  };
  achievement?: {
    name: string;
    description?: string;
  };
}

export default function VerifyBadgeModal({ isOpen, onClose }: VerifyBadgeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [credentialJson, setCredentialJson] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCredentialJson('');
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleVerify = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const credential = JSON.parse(credentialJson);
      const response = await openbadgesApi.verify(credential);
      setResult(response);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please paste a valid credential.');
      } else {
        setError(err.message || 'Verification failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCredentialJson(text);
    } catch {
      // Clipboard access denied
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-surface-50 p-6 shadow-xl transition-all">
                <Dialog.Title className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verify OpenBadge
                </Dialog.Title>

                <div className="mt-4 space-y-4">
                  {/* Input Area */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-text-secondary">
                        Paste Credential JSON
                      </label>
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="text-xs text-primary-500 hover:text-primary-600"
                      >
                        Paste from clipboard
                      </button>
                    </div>
                    <textarea
                      value={credentialJson}
                      onChange={(e) => setCredentialJson(e.target.value)}
                      className="input w-full min-h-[200px] font-mono text-sm"
                      placeholder='{"@context": [...], "type": ["VerifiableCredential", "OpenBadgeCredential"], ...}'
                    />
                  </div>

                  {/* Verification Result */}
                  {result && (
                    <div className={`p-4 rounded-lg border ${
                      result.verified
                        ? 'bg-success/10 border-success/20'
                        : 'bg-error/10 border-error/20'
                    }`}>
                      <div className="flex items-center gap-3">
                        {result.verified ? (
                          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <p className={`font-semibold ${result.verified ? 'text-success' : 'text-error'}`}>
                            {result.verified ? 'Credential Verified' : 'Verification Failed'}
                          </p>
                          {result.error && (
                            <p className="text-sm text-error">{result.error}</p>
                          )}
                        </div>
                      </div>

                      {/* Credential Details */}
                      {result.verified && (result.issuer || result.achievement) && (
                        <div className="mt-4 pt-4 border-t border-current/10 space-y-2">
                          {result.achievement && (
                            <div>
                              <p className="text-xs text-text-tertiary uppercase tracking-wide">Achievement</p>
                              <p className="font-medium text-text-primary">{result.achievement.name}</p>
                              {result.achievement.description && (
                                <p className="text-sm text-text-secondary">{result.achievement.description}</p>
                              )}
                            </div>
                          )}
                          {result.issuer && (
                            <div>
                              <p className="text-xs text-text-tertiary uppercase tracking-wide">Issuer</p>
                              <p className="font-medium text-text-primary">{result.issuer.name || result.issuer.id}</p>
                              <p className="text-xs text-text-tertiary font-mono">{result.issuer.id}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
                      {error}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn btn-secondary"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleVerify}
                      className="btn btn-primary"
                      disabled={isLoading || !credentialJson.trim()}
                    >
                      {isLoading ? (
                        <>
                          <span className="spinner w-4 h-4 mr-2" />
                          Verifying...
                        </>
                      ) : (
                        'Verify'
                      )}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
