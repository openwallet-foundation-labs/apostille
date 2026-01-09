'use client';

import React from 'react';
import type { OpenBadgeCredential } from '@/lib/api';

interface BadgeCardProps {
  badge: OpenBadgeCredential;
  onClick?: () => void;
}

export default function BadgeCard({ badge, onClick }: BadgeCardProps) {
  const achievement = badge.credentialSubject?.achievement;
  const issuer = typeof badge.issuer === 'string'
    ? { id: badge.issuer, name: badge.issuer }
    : badge.issuer;

  const isVerified = !!badge.proof;
  const issuedDate = badge.validFrom
    ? new Date(badge.validFrom).toLocaleDateString()
    : 'Unknown';

  return (
    <div
      className="card card-interactive p-4 cursor-pointer hover:shadow-lg transition-all duration-200"
      onClick={onClick}
    >
      {/* Badge Header */}
      <div className="flex items-start gap-4">
        {/* Badge Icon/Image */}
        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
          {achievement?.image?.id ? (
            <img
              src={achievement.image.id}
              alt={achievement.name}
              className="w-12 h-12 object-contain"
            />
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          )}
        </div>

        {/* Badge Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary truncate">
            {achievement?.name || 'Untitled Badge'}
          </h3>
          <p className="text-sm text-text-secondary truncate">
            {badge.name}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Issued by {issuer?.name || 'Unknown Issuer'}
          </p>
        </div>

        {/* Verification Status */}
        <div className="flex-shrink-0">
          {isVerified ? (
            <span className="badge badge-success flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Verified
            </span>
          ) : (
            <span className="badge badge-warning">Unverified</span>
          )}
        </div>
      </div>

      {/* Badge Description */}
      {achievement?.description && (
        <p className="mt-3 text-sm text-text-secondary line-clamp-2">
          {achievement.description}
        </p>
      )}

      {/* Badge Footer */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-tertiary">
        <span>Issued: {issuedDate}</span>
        <span className="flex items-center gap-1">
          {badge.proof?.cryptosuite && (
            <span className="bg-surface-100 px-2 py-0.5 rounded">
              {badge.proof.cryptosuite}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
