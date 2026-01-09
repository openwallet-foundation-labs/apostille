import { Dispatch, useState, useEffect } from "react"
import { demoApi } from '@/lib/api';

interface StepProofProps {
    formData: any,
    setFormData: Dispatch<any>
}

export default function StepProof({ formData, setFormData }: StepProofProps) {
    // Debug: log formData on mount and updates
    console.log('StepProof formData:', formData);

    const [connectionId, setConnectionId] = useState<string | null>(formData.connectionId || null);
    const [proofId, setProofId] = useState<string | null>(formData.proofId || null);
    const [proofState, setProofState] = useState<string>('idle');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [disclosedAttributes, setDisclosedAttributes] = useState<Record<string, string>>({});

    // Display friendly attribute descriptions (actual schema attributes are fetched dynamically by backend)
    const credentialType = formData.userType === 'student' ? 'Student ID Card' : 'Professional License';

    const institutionName = formData.userType === 'student'
        ? 'Campus Services Portal'
        : 'Legal Verification Service';
    const institutionIcon = formData.userType === 'student' ? '🏫' : '🏛️';

    // Poll for connection ID when component mounts
    useEffect(() => {
        if (!formData.oobId || connectionId) return;

        const pollConnection = async () => {
            try {
                const response = await demoApi.getConnection(formData.oobId);
                if (response.success && response.connectionId) {
                    setConnectionId(response.connectionId);
                    setFormData((prev: any) => ({...prev, connectionId: response.connectionId}));
                }
            } catch (err) {
                console.error('Error polling connection:', err);
            }
        };

        const intervalId = setInterval(pollConnection, 1000);
        pollConnection(); // Initial call

        return () => clearInterval(intervalId);
    }, [formData.oobId, connectionId, setFormData]);

    // Poll for proof status after request is sent
    useEffect(() => {
        if (!proofId || proofState === 'done') return;

        const pollProof = async () => {
            try {
                const response = await demoApi.getProof(proofId);
                console.log('Proof poll response:', response);
                if (response.success) {
                    setProofState(response.proof.state);
                    if (response.proof.state === 'done' && response.proof.isVerified) {
                        console.log('Proof verified! Disclosed attributes:', response.proof.disclosedAttributes);
                        setDisclosedAttributes(response.proof.disclosedAttributes || {});
                        setFormData((prev: any) => ({...prev, proofVerified: true}));
                    }
                }
            } catch (err) {
                console.error('Error polling proof:', err);
            }
        };

        const intervalId = setInterval(pollProof, 1000);
        pollProof(); // Initial call
        return () => clearInterval(intervalId);
    }, [proofId, proofState, setFormData]);

    const handleRequestProof = async () => {
        if (!connectionId) {
            setError('Connection not established yet. Please wait.');
            return;
        }

        const userType = formData.userType;
        if (!userType) {
            setError('User type not set. Please go back to step 1.');
            return;
        }

        console.log('Requesting proof with:', { connectionId, userType });

        setIsLoading(true);
        setError(null);

        try {
            const response = await demoApi.requestProof(connectionId, userType);
            if (response.success) {
                setProofId(response.proofId);
                setProofState(response.state);
                setFormData((prev: any) => ({...prev, proofId: response.proofId}));
            } else {
                setError(response.message || 'Failed to request proof');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to request proof');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSimulateResponse = () => {
        // In a real scenario, the wallet would auto-respond
        // For demo, we simulate the verified response with mock attributes matching the issued credentials
        setProofState('done');
        const mockAttributes: Record<string, string> = formData.userType === 'student'
            ? { Name: 'Alice', 'Student ID': 'S1234567890', Course: 'Computer Science', 'Graduation Year': '2025' }
            : { Name: 'Joyce', 'Lawyer Licence': '1234567890' };
        setDisclosedAttributes(mockAttributes);
        setFormData((prev: any) => ({...prev, proofVerified: true}));
    };

    return (
        <div className="w-full h-full">
            <div className="relative w-full flex flex-col justify-center gap-6 px-4 max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-1">
                    <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center text-white text-lg shadow-lg mx-auto mb-2">
                        {institutionIcon}
                    </div>
                    <h2 className="font-bold text-2xl text-text-primary mb-2">
                        {institutionName}
                    </h2>
                    <p className="text-base text-text-secondary">
                        Credential Verification Request
                    </p>
                </div>

                {/* Main Content Card */}
                <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl px-4 py-4 shadow-lg w-full max-w-sm mx-auto">
                    {proofState === 'done' ? (
                        // Verification Success
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl text-green-600 dark:text-green-400">✓</span>
                            </div>
                            <h3 className="font-semibold text-lg text-text-primary mb-2">
                                Credential Verified!
                            </h3>
                            <p className="text-sm text-text-secondary mb-4">
                                Your <span className="font-medium">{credentialType}</span> has been successfully verified.
                            </p>
                            <div className="bg-surface-100 dark:bg-surface-700 rounded-lg p-3 text-left">
                                {Object.keys(disclosedAttributes).length > 0 ? (
                                    <>
                                        <p className="text-sm font-medium text-text-secondary mb-2">
                                            Disclosed Attributes:
                                        </p>
                                        {Object.entries(disclosedAttributes).map(([key, value]) => (
                                            <div key={key} className="flex justify-between text-sm py-1 border-b border-border-secondary last:border-0">
                                                <span className="text-text-tertiary">{key}:</span>
                                                <span className="font-medium text-text-primary">{value}</span>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <div className="text-center py-2">
                                        <div className="flex items-center justify-center gap-2 text-sm text-green-700 dark:text-green-300">
                                            <span>✓</span>
                                            <span>All requested attributes verified</span>
                                        </div>
                                        <p className="text-xs text-text-tertiary mt-2">
                                            The verifier confirmed your credential is valid.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : proofId ? (
                        // Waiting for wallet response
                        <div className="text-center">
                            <div className="animate-pulse mb-4">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                                    <span className="text-xl">📱</span>
                                </div>
                            </div>
                            <h3 className="font-semibold text-lg text-text-primary mb-2">
                                Waiting for Wallet Response
                            </h3>
                            <p className="text-sm text-text-secondary mb-4">
                                Please approve the proof request in your Esse Wallet
                            </p>
                            <button
                                onClick={handleSimulateResponse}
                                className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Simulate Wallet Response
                            </button>
                        </div>
                    ) : (
                        // Initial state - show verification request
                        <div>
                            <h3 className="font-semibold text-lg text-text-primary mb-3 text-center">
                                Verify Your Credential
                            </h3>
                            <p className="text-sm text-text-secondary mb-4 text-center">
                                A verifier wants to confirm your <span className="font-medium">{credentialType}</span> credential.
                            </p>
                            <div className="bg-surface-100 dark:bg-surface-700 rounded-lg p-3 mb-4">
                                <div className="flex items-center gap-2 text-sm py-1">
                                    <span className="text-blue-500">🔐</span>
                                    <span className="text-text-secondary">All credential attributes will be verified</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm py-1">
                                    <span className="text-blue-500">✓</span>
                                    <span className="text-text-secondary">Zero-knowledge proof ensures privacy</span>
                                </div>
                            </div>

                            {!connectionId && (
                                <div className="flex items-center justify-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                                    <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
                                    <span>Establishing connection...</span>
                                </div>
                            )}

                            {error && (
                                <p className="text-red-500 text-sm text-center mb-4">{error}</p>
                            )}

                            <button
                                onClick={handleRequestProof}
                                disabled={isLoading || !connectionId}
                                className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    connectionId
                                        ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                        : 'bg-surface-200 dark:bg-surface-600 text-text-tertiary cursor-not-allowed'
                                }`}
                            >
                                {isLoading ? 'Requesting...' : 'Verify Credential'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 w-full max-w-sm mx-auto">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-blue-600 dark:text-blue-400">💡</span>
                        <span className="font-semibold text-blue-800 dark:text-blue-200 text-sm">Demo Note</span>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                        {proofState === 'done'
                            ? 'In reality, the verifier would cryptographically validate the proof without seeing your full credential.'
                            : 'In a real scenario, your wallet would receive a notification and you\'d approve sharing these specific attributes.'
                        }
                    </p>
                </div>
            </div>
        </div>
    );
}
