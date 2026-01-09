'use client';

import React, { useState } from 'react';
import { createInvitation } from '../utils/api';
import { QRCodeSVG } from 'qrcode.react';

type Invitation = {
  invitationId: string;
  invitationUrl: string;
  invitation: Record<string, any>;
};

interface CreateInvitationProps {
  tenantId: string;
}

export default function CreateInvitation({ tenantId }: CreateInvitationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [label, setLabel] = useState('');


  const MAIN_WALLET_ID = process.env.MAIN_WALLET_ID || 'credo-main-wallet';
  const MAIN_WALLET_KEY = process.env.MAIN_WALLET_KEY || 'credo-main-wallet-key';

  const handleCreateInvitation = async () => {
    if (!tenantId) {
      setError('Tenant ID is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result:any = await createInvitation(tenantId, MAIN_WALLET_ID, MAIN_WALLET_KEY, label?.trim() || undefined);
      
      if (result.success && result.invitation) {
        setInvitation(result.invitation);
        setShowQR(true);
        

        console.log('Created invitation:', result);
      } else {
        throw new Error(result.message || 'Failed to create invitation');
      }
    } catch (err: any) {
      console.error('Error creating invitation:', err);
      setError(err.message || 'Failed to create invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (invitation?.invitationUrl) {
      navigator.clipboard.writeText(invitation.invitationUrl)
        .then(() => {
          alert('Invitation URL copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy invitation URL:', err);
          setError('Failed to copy invitation URL');
        });
    }
  };

  const resetInvitation = () => {
    setInvitation(null);
    setShowQR(false);
    setShowDebug(false);
  };

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-text-secondary mb-4">Create Connection Invitation</h2>

      {error && (
        <div className="bg-error-100 border-l-4 border-error-600 p-4 mb-4">
          <p className="text-error-700">{error}</p>
        </div>
      )}

      {!invitation ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="inv-label" className="form-label">Invitation Label (optional)</label>
            <input
              id="inv-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input w-full"
              placeholder="e.g. Support Desk"
            />
          </div>
          <button
            onClick={handleCreateInvitation}
            disabled={isLoading}
            className="btn btn-primary w-full"
          >
            {isLoading ? 'Creating...' : 'Create Invitation'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            {showQR && (
              <div className="border p-4 bg-white rounded-lg">
                <QRCodeSVG value={invitation.invitationUrl} size={200} />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Invitation URL:</p>
            <div className="bg-surface-100 p-3 border border-border-secondary rounded-md overflow-hidden">
              <p className="font-mono text-xs text-text-primary break-all mb-2">{invitation.invitationUrl}</p>
              <div className="flex space-x-2">
                <button
                  onClick={handleCopyUrl}
                  className="btn btn-sm btn-secondary"
                >
                  Copy URL
                </button>
                <a
                  href={invitation.invitationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-primary"
                >
                  Open URL
                </a>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={resetInvitation}
              className="btn btn-secondary flex-1"
            >
              Create New
            </button>
            <button
              onClick={() => setShowQR(!showQR)}
              className="btn btn-primary flex-1"
            >
              {showQR ? 'Hide QR Code' : 'Show QR Code'}
            </button>
          </div>
          
          <div className="mt-4">
            <p className="text-xs text-text-tertiary">
              Invitation ID: <span className="font-mono">{invitation.invitationId}</span>
            </p>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-text-tertiary underline mt-2"
            >
              {showDebug ? 'Hide Details' : 'Show Technical Details'}
            </button>

            {showDebug && (
              <div className="mt-2 p-3 bg-surface-200 rounded-md overflow-auto">
                <h4 className="text-xs font-semibold text-text-primary mb-1">Raw Invitation Data:</h4>
                <pre className="text-xs text-text-primary overflow-auto max-h-40 font-mono">
                  {JSON.stringify(invitation.invitation, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 
