'use client';

import React from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import type { OpenBadgeCredential } from '@/lib/api';

interface BadgeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  badge: OpenBadgeCredential | null;
}

export default function BadgeDetailsModal({ isOpen, onClose, badge }: BadgeDetailsModalProps) {
  if (!badge) return null;

  const achievement = badge.credentialSubject?.achievement;
  const issuer = typeof badge.issuer === 'string'
    ? { id: badge.issuer, name: badge.issuer, url: undefined, description: undefined }
    : badge.issuer;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(badge, null, 2));
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-surface-50 shadow-xl transition-all">
                {/* Header */}
                <div className="bg-gradient-to-br from-primary-500 to-primary-700 p-6 text-white">
                  <div className="flex items-start gap-4">
                    {/* Badge Icon */}
                    <div className="flex-shrink-0 w-20 h-20 rounded-xl bg-white/20 flex items-center justify-center">
                      {achievement?.image?.id ? (
                        <img
                          src={achievement.image.id}
                          alt={achievement.name}
                          className="w-16 h-16 object-contain"
                        />
                      ) : (
                        <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1">
                      <Dialog.Title className="text-xl font-bold">
                        {achievement?.name || 'Untitled Badge'}
                      </Dialog.Title>
                      <p className="text-white/80 mt-1">{badge.name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {badge.proof && (
                          <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded text-sm">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Verified
                          </span>
                        )}
                        {achievement?.achievementType && (
                          <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                            {achievement.achievementType}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Close Button */}
                    <button
                      onClick={onClose}
                      className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                  {/* Description */}
                  {achievement?.description && (
                    <div>
                      <h4 className="text-sm font-medium text-text-tertiary uppercase tracking-wide mb-2">
                        Description
                      </h4>
                      <p className="text-text-primary">{achievement.description}</p>
                    </div>
                  )}

                  {/* Criteria */}
                  {achievement?.criteria?.narrative && (
                    <div>
                      <h4 className="text-sm font-medium text-text-tertiary uppercase tracking-wide mb-2">
                        Criteria
                      </h4>
                      <p className="text-text-secondary">{achievement.criteria.narrative}</p>
                    </div>
                  )}

                  {/* Issuer Info */}
                  <div>
                    <h4 className="text-sm font-medium text-text-tertiary uppercase tracking-wide mb-2">
                      Issuer
                    </h4>
                    <div className="bg-surface-100 rounded-lg p-4">
                      <p className="font-medium text-text-primary">{issuer?.name || 'Unknown'}</p>
                      {issuer?.url && (
                        <a href={issuer.url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline text-sm">
                          {issuer.url}
                        </a>
                      )}
                      <p className="text-xs text-text-tertiary font-mono mt-1 break-all">{issuer?.id}</p>
                    </div>
                  </div>

                  {/* Proof Details */}
                  {badge.proof && (
                    <div>
                      <h4 className="text-sm font-medium text-text-tertiary uppercase tracking-wide mb-2">
                        Proof
                      </h4>
                      <div className="bg-surface-100 rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Type</span>
                          <span className="text-text-primary font-mono">{badge.proof.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Cryptosuite</span>
                          <span className="text-text-primary font-mono">{badge.proof.cryptosuite}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Created</span>
                          <span className="text-text-primary">{new Date(badge.proof.created).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Purpose</span>
                          <span className="text-text-primary">{badge.proof.proofPurpose}</span>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Verification Method</span>
                          <p className="text-text-primary font-mono text-xs break-all mt-1">{badge.proof.verificationMethod}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-text-tertiary">Credential ID</span>
                      <p className="text-text-primary font-mono text-xs break-all">{badge.id}</p>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Issued</span>
                      <p className="text-text-primary">{new Date(badge.validFrom).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border p-4 flex justify-end gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy JSON
                  </button>
                  <button onClick={onClose} className="btn btn-primary">
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
