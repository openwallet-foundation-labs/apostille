'use client';

import { useState, useEffect, useCallback } from 'react';
import { poeApi, connectionApi } from '@/lib/api';

interface PoeSession {
    id: string;
    sessionId: string;
    state: string;
    role: string;
    connectionId: string;
    programId?: string;
    bindingContext?: {
        nonce: string;
        context_hash: string;
        session_id: string;
    };
    verificationResult?: {
        verified: boolean;
        errors?: string[];
    };
    execution?: {
        program_id: string;
        program_version?: string;
        disclosure: string;
    };
    proofArtifact?: any;
    createdAt: string;
    updatedAt: string;
}

interface Program {
    program_id: string;
    version: string;
    name: string;
    description?: string;
}

interface Connection {
    id: string;
    state: string;
    theirLabel?: string;
}

export default function PoePage() {
    const [sessions, setSessions] = useState<PoeSession[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [selectedSession, setSelectedSession] = useState<PoeSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Request form state
    const [showRequestForm, setShowRequestForm] = useState(false);
    const [requestForm, setRequestForm] = useState({
        connectionId: '',
        programId: '',
        disclosure: 'proof-only' as 'proof-only' | 'proof+summary' | 'proof+evidence-ref',
    });
    const [submitting, setSubmitting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [sessionsRes, programsRes, connectionsRes] = await Promise.all([
                poeApi.getSessions(),
                poeApi.getPrograms(),
                connectionApi.getAll(),
            ]);

            if (sessionsRes.success) setSessions(sessionsRes.sessions);
            if (programsRes.success) setPrograms(programsRes.programs);
            if (connectionsRes.success) {
                const completedConnections = connectionsRes.connections.filter(
                    (c: Connection) => c.state === 'completed'
                );
                setConnections(completedConnections);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRequestProof = async () => {
        if (!requestForm.connectionId || !requestForm.programId) return;

        try {
            setSubmitting(true);
            const response = await poeApi.requestProofOfExecution({
                connectionId: requestForm.connectionId,
                programs: [
                    {
                        program_id: requestForm.programId,
                        disclosure: requestForm.disclosure,
                    },
                ],
            });

            if (response.success) {
                setShowRequestForm(false);
                setRequestForm({ connectionId: '', programId: '', disclosure: 'proof-only' });
                fetchData();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleComplete = async (sessionId: string) => {
        try {
            await poeApi.complete(sessionId);
            fetchData();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleAcceptProposal = async (sessionId: string) => {
        try {
            await poeApi.acceptProposal(sessionId);
            fetchData();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDeclineProposal = async (sessionId: string) => {
        try {
            await poeApi.declineProposal(sessionId, 'Declined by user');
            fetchData();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const getStateColor = (state: string) => {
        switch (state) {
            case 'completed':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'request-sent':
            case 'request-received':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
            case 'submit-sent':
            case 'submit-received':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            case 'proposed':
            case 'accepted':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
            case 'problem':
            case 'declined':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
            default:
                return 'bg-surface-100 text-text-secondary dark:bg-surface-700 dark:text-text-secondary';
        }
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'requester':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
            case 'prover':
                return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
            default:
                return 'bg-surface-100 text-text-secondary dark:bg-surface-700 dark:text-text-secondary';
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowRequestForm(true)}
                    className="btn btn-primary"
                >
                    Request Proof
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Request Form Modal */}
            {showRequestForm && (
                <div className="modal-backdrop">
                    <div className="modal-container max-w-md">
                        <h2 className="text-xl font-bold mb-4 text-text-primary">
                            Request Proof of Execution
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="form-label">
                                    Connection
                                </label>
                                <select
                                    value={requestForm.connectionId}
                                    onChange={(e) =>
                                        setRequestForm({ ...requestForm, connectionId: e.target.value })
                                    }
                                    className="input w-full"
                                >
                                    <option value="">Select a connection</option>
                                    {connections.map((conn) => (
                                        <option key={conn.id} value={conn.id}>
                                            {conn.theirLabel || conn.id.slice(0, 12) + '...'}
                                        </option>
                                    ))}
                                </select>
                                {connections.length === 0 && (
                                    <p className="text-sm text-text-tertiary mt-1">
                                        No active connections. Create a connection first.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="form-label">
                                    Program
                                </label>
                                <select
                                    value={requestForm.programId}
                                    onChange={(e) =>
                                        setRequestForm({ ...requestForm, programId: e.target.value })
                                    }
                                    className="input w-full"
                                >
                                    <option value="">Select a program</option>
                                    {programs.map((prog) => (
                                        <option key={prog.program_id} value={prog.program_id}>
                                            {prog.name || prog.program_id}
                                        </option>
                                    ))}
                                </select>
                                {programs.length === 0 && (
                                    <p className="text-sm text-text-tertiary mt-1">
                                        No programs registered. Configure PoePrograms in the backend.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="form-label">
                                    Disclosure Level
                                </label>
                                <select
                                    value={requestForm.disclosure}
                                    onChange={(e) =>
                                        setRequestForm({
                                            ...requestForm,
                                            disclosure: e.target.value as any,
                                        })
                                    }
                                    className="input w-full"
                                >
                                    <option value="proof-only">Proof Only (Minimal)</option>
                                    <option value="proof+summary">Proof + Summary</option>
                                    <option value="proof+evidence-ref">Proof + Evidence References</option>
                                </select>
                                <p className="text-xs text-text-tertiary mt-1">
                                    Controls how much information is disclosed with the proof
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setShowRequestForm(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRequestProof}
                                disabled={!requestForm.connectionId || !requestForm.programId || submitting}
                                className="btn btn-primary"
                            >
                                {submitting ? 'Sending...' : 'Send Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sessions List */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 text-text-primary">Sessions</h2>
                <div className="grid gap-4">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 bg-surface-100 rounded-lg border border-dashed border-border-secondary">
                            <svg className="mx-auto h-12 w-12 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <p className="mt-2 text-text-secondary">No POE sessions yet</p>
                            <p className="text-sm text-text-tertiary">
                                Request a proof of execution to get started
                            </p>
                        </div>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.id}
                                className="card card-hover cursor-pointer p-4"
                                onClick={() => setSelectedSession(session)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getRoleColor(session.role)}`}>
                                            {session.role}
                                        </span>
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStateColor(session.state)}`}>
                                            {session.state}
                                        </span>
                                    </div>
                                    <span className="text-sm text-text-tertiary">
                                        {formatDate(session.createdAt)}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-1">
                                    <p className="text-sm text-text-secondary">
                                        <span className="text-text-tertiary">Session:</span>{' '}
                                        <code className="text-xs bg-surface-200 px-1 rounded">
                                            {session.sessionId?.slice(0, 20)}...
                                        </code>
                                    </p>
                                    {session.programId && (
                                        <p className="text-sm text-text-secondary">
                                            <span className="text-text-tertiary">Program:</span> {session.programId}
                                        </p>
                                    )}
                                    {session.verificationResult && (
                                        <p className="text-sm mt-1">
                                            <span className="text-text-tertiary">Verified:</span>{' '}
                                            <span className={session.verificationResult.verified ? 'text-success-600' : 'text-error-600'}>
                                                {session.verificationResult.verified ? 'Yes' : 'No'}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                {/* Action buttons based on state and role */}
                                <div className="mt-3 flex gap-2">
                                    {session.state === 'submit-received' && session.role === 'requester' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleComplete(session.id);
                                            }}
                                            className="btn btn-sm bg-success-600 hover:bg-success-700 text-white"
                                        >
                                            Complete
                                        </button>
                                    )}
                                    {session.state === 'proposed' && session.role === 'requester' && (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAcceptProposal(session.id);
                                                }}
                                                className="btn btn-sm bg-success-600 hover:bg-success-700 text-white"
                                            >
                                                Accept
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeclineProposal(session.id);
                                                }}
                                                className="btn btn-sm bg-error-600 hover:bg-error-700 text-white"
                                            >
                                                Decline
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Session Detail Modal */}
            {selectedSession && (
                <div className="modal-backdrop">
                    <div className="modal-container max-w-2xl max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-text-primary">Session Details</h2>
                            <button
                                onClick={() => setSelectedSession(null)}
                                className="text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-text-tertiary">Session ID</label>
                                <p className="font-mono text-sm break-all text-text-primary">
                                    {selectedSession.sessionId}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-text-tertiary">State</label>
                                    <p>
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStateColor(selectedSession.state)}`}>
                                            {selectedSession.state}
                                        </span>
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm text-text-tertiary">Role</label>
                                    <p>
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getRoleColor(selectedSession.role)}`}>
                                            {selectedSession.role}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {selectedSession.programId && (
                                <div>
                                    <label className="text-sm text-text-tertiary">Program ID</label>
                                    <p className="text-text-primary">{selectedSession.programId}</p>
                                </div>
                            )}

                            {selectedSession.bindingContext && (
                                <div>
                                    <label className="text-sm text-text-tertiary">Binding Context</label>
                                    <pre className="mt-1 p-3 bg-surface-100 rounded text-xs overflow-x-auto text-text-secondary">
                                        {JSON.stringify(selectedSession.bindingContext, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedSession.verificationResult && (
                                <div>
                                    <label className="text-sm text-text-tertiary">Verification Result</label>
                                    <div
                                        className={`mt-1 p-3 rounded ${
                                            selectedSession.verificationResult.verified
                                                ? 'bg-success-100 border border-success-300'
                                                : 'bg-error-100 border border-error-300'
                                        }`}
                                    >
                                        <p className={selectedSession.verificationResult.verified ? 'text-success-700' : 'text-error-700'}>
                                            {selectedSession.verificationResult.verified
                                                ? 'Proof Verified Successfully'
                                                : 'Verification Failed'}
                                        </p>
                                        {selectedSession.verificationResult.errors && selectedSession.verificationResult.errors.length > 0 && (
                                            <ul className="mt-2 text-sm text-error-600 list-disc list-inside">
                                                {selectedSession.verificationResult.errors.map((err, i) => (
                                                    <li key={i}>{err}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedSession.proofArtifact && (
                                <div>
                                    <label className="text-sm text-text-tertiary">Proof Artifact</label>
                                    <pre className="mt-1 p-3 bg-surface-100 rounded text-xs overflow-x-auto text-text-secondary max-h-48">
                                        {JSON.stringify(selectedSession.proofArtifact, null, 2)}
                                    </pre>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <label className="text-text-tertiary">Created</label>
                                    <p className="text-text-primary">{formatDate(selectedSession.createdAt)}</p>
                                </div>
                                <div>
                                    <label className="text-text-tertiary">Updated</label>
                                    <p className="text-text-primary">{formatDate(selectedSession.updatedAt)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Programs Section */}
            <div>
                <h2 className="text-lg font-semibold mb-4 text-text-primary">Registered Programs</h2>
                {programs.length === 0 ? (
                    <div className="text-center py-8 bg-surface-100 rounded-lg border border-dashed border-border-secondary">
                        <svg className="mx-auto h-10 w-10 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        <p className="mt-2 text-text-secondary">No programs registered</p>
                        <p className="text-sm text-text-tertiary">
                            Add PoeProgram instances in the PoeModule configuration
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {programs.map((prog) => (
                            <div key={prog.program_id} className="card p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-medium text-text-primary">
                                            {prog.name || prog.program_id}
                                        </p>
                                        <p className="text-sm text-text-tertiary font-mono">
                                            {prog.program_id}
                                        </p>
                                        {prog.description && (
                                            <p className="text-sm text-text-secondary mt-1">
                                                {prog.description}
                                            </p>
                                        )}
                                    </div>
                                    <span className="badge badge-gray">
                                        v{prog.version}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
