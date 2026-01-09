import Link from "next/link"
import { Dispatch, useState, useEffect } from "react"
import { QRCodeSVG } from 'qrcode.react';
import { demoApi } from '@/lib/api';

interface StepFourProps{
    formData: any,
    setFormData: Dispatch<any>
}

export default function StepFour({ formData, setFormData }: StepFourProps) {
    const [invitationUrl, setInvitationUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasScanned, setHasScanned] = useState(false);
    
    const institutionName = formData.userType === 'student' ? 'Digital University' : 'Professional Association';
    const credentialType = formData.userType === 'student' ? 'Student ID Card' : 'Professional License';
    const demoLabel = formData.userType === 'student' ? 'demo-student' : 'demo-lawyer';
    const institutionIcon = formData.userType === 'student' ? '🎓' : '⚖️';

    useEffect(() => {
        const fetchInvitation = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                const response = await demoApi.createInvitation(demoLabel, `Get ${credentialType} credential`);

                if (response.message === 'success' && response.data?.url) {
                    setInvitationUrl(response.data.url);
                    // Store OOB ID for use in proof verification step
                    setFormData({...formData, oobId: response.data.id});
                } else {
                    throw new Error(response.message || 'Invalid response from server');
                }
            } catch (err: any) {
                console.error('Error fetching invitation:', err);
                setError(err.message || 'Failed to create invitation');
            } finally {
                setIsLoading(false);
            }
        };

        fetchInvitation();
    }, [demoLabel, credentialType]);

    const handleQrScan = () => {
        setHasScanned(true);
        setFormData({...formData, hasCredentials: true});
    };

    const handleRetry = () => {
        setError(null);
        setIsLoading(true);
        // Trigger re-fetch by changing a dependency
        const fetchInvitation = async () => {
            try {
                const response = await demoApi.createInvitation(demoLabel, `Get ${credentialType} credential`);

                if (response.message === 'success' && response.data?.url) {
                    setInvitationUrl(response.data.url);
                    // Store OOB ID for use in proof verification step
                    setFormData({...formData, oobId: response.data.id});
                } else {
                    throw new Error(response.message || 'Invalid response from server');
                }
            } catch (err: any) {
                console.error('Error fetching invitation:', err);
                setError(err.message || 'Failed to create invitation');
            } finally {
                setIsLoading(false);
            }
        };
        fetchInvitation();
    };

    return (
        <div className="w-full h-full">
            <div className="relative w-full flex flex-col justify-center gap-6 px-4 max-w-4xl mx-auto">
                <div className="text-center mb-1">
                    <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center text-white text-lg shadow-lg mx-auto mb-2">
                        {institutionIcon}
                    </div>
                    <h2 className="font-bold text-2xl text-text-primary mb-2">
                        {institutionName}
                    </h2>
                    <p className="text-base text-text-secondary">
                        Credential Issuer Portal
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-3"></div>
                        <p className="text-text-secondary text-sm">
                            Preparing your credential...
                        </p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-500 text-lg mb-3">
                            ❌
                        </div>
                        <h3 className="font-semibold text-lg text-text-primary mb-2">
                            Connection Error
                        </h3>
                        <p className="text-text-secondary text-center mb-3 text-sm">
                            {error}
                        </p>
                        <button
                            onClick={handleRetry}
                            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg shadow-md transition-colors text-sm"
                        >
                            Try Again
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl px-3 py-1 shadow-lg w-full max-w-sm">
                            <div className="text-center mb-2">
                                <h3 className="font-semibold text-lg text-text-primary mb-1">
                                    Ready to issue: {credentialType}
                                </h3>
                                <p className="text-text-secondary text-sm">
                                    Scan the QR code with your Esse Wallet app
                                </p>
                            </div>
                            
                            <div className="flex justify-center mb-2">
                                <div className="bg-white p-1 rounded-lg shadow-inner">
                                    {invitationUrl ? (
                                        <QRCodeSVG
                                            value={invitationUrl}
                                            size={270}
                                            level="M"
                                            includeMargin={true}
                                        />
                                    ) : (
                                        <div className="w-[150px] h-[150px] bg-surface-100 dark:bg-surface-700 rounded-lg flex items-center justify-center">
                                            <span className="text-text-tertiary text-sm">Loading...</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="text-center">
                                <button
                                    onClick={handleQrScan}
                                    className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    {hasScanned ? '✓ Credential Received' : 'Simulate QR Scan'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-2 w-full max-w-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-blue-600 dark:text-blue-400">💡</span>
                                <span className="font-semibold text-blue-800 dark:text-blue-200 text-sm">Demo Note</span>
                            </div>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                Click "Simulate QR Scan" to continue. In reality, you'd scan this with your mobile wallet.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}