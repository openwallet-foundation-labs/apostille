'use client';

import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { openbadgesApi, type IssueBadgeRequest } from '@/lib/api';

interface Connection {
  id: string;
  state: string;
  theirLabel?: string;
}

interface IssueBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  connections?: Connection[];
}

export default function IssueBadgeModal({ isOpen, onClose, onSuccess, connections }: IssueBadgeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [recipientName, setRecipientName] = useState('');
  const [recipientDid, setRecipientDid] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [achievementName, setAchievementName] = useState('');
  const [achievementDescription, setAchievementDescription] = useState('');
  const [achievementType, setAchievementType] = useState('Badge');
  const [criteria, setCriteria] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const resetForm = () => {
    setRecipientName('');
    setRecipientDid('');
    setRecipientEmail('');
    setSelectedConnectionId('');
    setAchievementName('');
    setAchievementDescription('');
    setAchievementType('Badge');
    setCriteria('');
    setImageUrl('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const badgeData: IssueBadgeRequest = {
        recipientName,
        ...(recipientDid && { recipientDid }),
        ...(recipientEmail && { recipientEmail }),
        ...(selectedConnectionId && { connectionId: selectedConnectionId }),
        achievement: {
          name: achievementName,
          description: achievementDescription,
          achievementType,
          ...(criteria && { criteria: { narrative: criteria } }),
          ...(imageUrl && { image: { id: imageUrl, type: 'Image' } }),
        },
      };

      await openbadgesApi.issue(badgeData);

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to issue badge');
    } finally {
      setIsLoading(false);
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  Issue OpenBadge
                </Dialog.Title>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* Recipient Section */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-text-secondary">Recipient</h4>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Recipient Name <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="input w-full"
                        placeholder="John Doe"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Recipient DID (optional)
                      </label>
                      <input
                        type="text"
                        value={recipientDid}
                        onChange={(e) => setRecipientDid(e.target.value)}
                        className="input w-full"
                        placeholder="did:key:z6Mk..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Recipient Email (optional)
                      </label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="input w-full"
                        placeholder="recipient@example.com"
                      />
                      <p className="text-xs text-text-tertiary mt-1">
                        Send email notification when badge is issued
                      </p>
                    </div>

                    {connections && connections.length > 0 && (
                      <div>
                        <label className="block text-sm text-text-secondary mb-1">
                          Send via Connection (optional)
                        </label>
                        <select
                          value={selectedConnectionId}
                          onChange={(e) => setSelectedConnectionId(e.target.value)}
                          className="input w-full"
                        >
                          <option value="">-- Don&apos;t send via DIDComm --</option>
                          {connections.map((conn) => (
                            <option key={conn.id} value={conn.id}>
                              {conn.theirLabel || 'Unknown'} ({conn.id.slice(0, 8)}...)
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-text-tertiary mt-1">
                          Send badge directly to recipient&apos;s wallet
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Achievement Section */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    <h4 className="text-sm font-medium text-text-secondary">Achievement</h4>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Achievement Name <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={achievementName}
                        onChange={(e) => setAchievementName(e.target.value)}
                        className="input w-full"
                        placeholder="Data Science Fundamentals"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Description <span className="text-error">*</span>
                      </label>
                      <textarea
                        value={achievementDescription}
                        onChange={(e) => setAchievementDescription(e.target.value)}
                        className="input w-full min-h-[80px]"
                        placeholder="Demonstrates proficiency in basic data science concepts..."
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-text-secondary mb-1">
                          Type
                        </label>
                        <select
                          value={achievementType}
                          onChange={(e) => setAchievementType(e.target.value)}
                          className="input w-full"
                        >
                          <option value="Badge">Badge</option>
                          <option value="Certificate">Certificate</option>
                          <option value="Certification">Certification</option>
                          <option value="Course">Course</option>
                          <option value="Degree">Degree</option>
                          <option value="License">License</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-text-secondary mb-1">
                          Image URL (optional)
                        </label>
                        <input
                          type="url"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          className="input w-full"
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-text-secondary mb-1">
                        Criteria (optional)
                      </label>
                      <textarea
                        value={criteria}
                        onChange={(e) => setCriteria(e.target.value)}
                        className="input w-full min-h-[60px]"
                        placeholder="Complete all course modules with 80% or higher..."
                      />
                    </div>
                  </div>

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
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isLoading || !recipientName || !achievementName || !achievementDescription}
                    >
                      {isLoading ? (
                        <>
                          <span className="spinner w-4 h-4 mr-2" />
                          Issuing...
                        </>
                      ) : (
                        'Issue Badge'
                      )}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
