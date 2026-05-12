'use client'
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { demoApi } from '@/lib/api';

const CREDENTIALS = [
  // SD-JWT
  {
    id: 'StudentID',
    name: 'Student ID',
    icon: '🎓',
    type: 'sd-jwt',
    desc: 'University student identification card',
    attributes: ['given_name', 'family_name', 'student_id', 'university', 'program']
  },
  {
    id: 'ProfessionalLicense',
    name: 'Professional License',
    icon: '⚖️',
    type: 'sd-jwt',
    desc: 'State bar association lawyer license',
    attributes: ['given_name', 'family_name', 'license_number', 'profession', 'issuing_authority']
  },
  {
    id: 'EmployeeBadge',
    name: 'Employee Badge',
    icon: '💼',
    type: 'sd-jwt',
    desc: 'Corporate employee identification',
    attributes: ['given_name', 'family_name', 'employee_id', 'department', 'job_title']
  },
  {
    id: 'HealthInsurance',
    name: 'Health Insurance',
    icon: '🏥',
    type: 'sd-jwt',
    desc: 'Global care provider member card',
    attributes: ['given_name', 'family_name', 'member_id', 'plan_name', 'insurer']
  },
  {
    id: 'LoyaltyMembership',
    name: 'Loyalty Membership',
    icon: '⭐',
    type: 'sd-jwt',
    desc: 'SkyHigh rewards gold tier membership',
    attributes: ['given_name', 'family_name', 'member_id', 'tier', 'points']
  },
  {
    id: 'AgeVerification',
    name: 'Age Verification',
    icon: '🔞',
    type: 'sd-jwt',
    desc: 'Proof of age and nationality',
    attributes: ['given_name', 'family_name', 'birth_date', 'over_18', 'over_21']
  },
  
  // OBv3
  {
    id: 'AcademicExcellence',
    name: 'Academic Excellence',
    icon: '🏆',
    type: 'obv3',
    desc: "Dean's List for Academic Excellence",
    badgeType: 'Award',
    criteria: 'Student must complete at least 12 credit hours with a minimum 3.8 GPA.'
  },
  {
    id: 'SkillsCertification',
    name: 'Skills Certification',
    icon: '📜',
    type: 'obv3',
    desc: 'Cloud Computing Specialist',
    badgeType: 'Certificate',
    criteria: 'Passed the Cloud Computing Specialist Exam with a score of 85% or higher.'
  },
  {
    id: 'CourseCompletion',
    name: 'Course Completion',
    icon: '🎯',
    type: 'obv3',
    desc: 'Introduction to Web Development',
    badgeType: 'CourseRecord',
    criteria: 'Completed all course modules and the final capstone project.'
  }
];

export default function OID4VCDemo() {
  const [recipientName, setRecipientName] = useState('Alice Johnson');
  const [activeOffer, setActiveOffer] = useState<{
    credentialType: string;
    uri: string;
    id: string;
    status: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // Poll status for active offer
  useEffect(() => {
    if (!activeOffer || !activeOffer.id || activeOffer.status === 'credential_issued' || activeOffer.error) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await demoApi.getOid4vcOfferStatus(activeOffer.id);
        
        if (response.success && response.status !== activeOffer.status) {
          setActiveOffer(prev => prev ? { ...prev, status: response.status } : null);
        }
      } catch (err) {
        console.error(`Failed to poll status:`, err);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeOffer]);

  const handleIssue = async (credentialType: string) => {
    setActiveOffer({
      credentialType,
      uri: '',
      id: '',
      status: 'pending',
      loading: true,
      error: null
    });

    try {
      const response = await demoApi.createOid4vcOffer(credentialType, recipientName);
      
      if (response.success) {
        setActiveOffer({
          credentialType,
          uri: response.offerUri,
          id: response.offerId,
          status: 'pending',
          loading: false,
          error: null
        });
      } else {
        throw new Error(response.error_description || 'Failed to create offer');
      }
    } catch (err: any) {
      setActiveOffer(prev => prev ? { ...prev, loading: false, error: err.message || 'Error connecting to server' } : null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-3 py-1 rounded-full text-sm font-medium animate-pulse">Waiting for scan</span>;
      case 'token_issued':
        return <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium">Processing</span>;
      case 'credential_issued':
        return <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">Issued Successfully ✓</span>;
      case 'expired':
        return <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-3 py-1 rounded-full text-sm font-medium">Expired</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 px-3 py-1 rounded-full text-sm font-medium">{status}</span>;
    }
  };

  const renderCompactCard = (cred: typeof CREDENTIALS[0]) => {
    const isActive = activeOffer?.credentialType === cred.id;

    return (
      <motion.button
        key={cred.id}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (!isActive) handleIssue(cred.id);
        }}
        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
          isActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md'
            : 'border-transparent bg-white dark:bg-surface-800 hover:border-border-secondary shadow-sm'
        }`}
      >
        <div className="w-12 h-12 bg-gradient-to-br from-surface-100 to-surface-200 dark:from-surface-700 dark:to-surface-800 rounded-lg flex items-center justify-center text-2xl shadow-inner">
          {cred.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-text-primary truncate">{cred.name}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-text-secondary">
              {cred.type === 'sd-jwt' ? 'SD-JWT' : 'OBv3'}
            </span>
          </div>
          <p className="text-xs text-text-secondary truncate">{cred.desc}</p>
        </div>
      </motion.button>
    );
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-surface-100 to-primary-50 dark:from-surface-900 dark:to-surface-800 pb-20">
      {/* Hero Section */}
      <div className="bg-surface-50 dark:bg-surface-900 border-b border-border-secondary pt-12 pb-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-600 text-white rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-primary-600/20">
              💳
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight">
                Essi Showcase
              </h1>
              <p className="text-text-secondary">Instant verifiable credential issuance demo</p>
            </div>
          </div>

          <div className="w-full md:w-auto bg-white dark:bg-surface-800 p-3 rounded-xl shadow-md border border-border-secondary flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400">
              👤
            </div>
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="recipientName" className="block text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-0.5">
                Issue to
              </label>
              <input
                id="recipientName"
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full bg-transparent border-none p-0 text-sm font-semibold text-text-primary focus:ring-0 placeholder-text-tertiary"
                placeholder="Enter full name"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column: Credential Selection */}
          <div className="flex-1 flex flex-col gap-8">
            <div>
              <h2 className="text-sm font-bold text-text-tertiary uppercase tracking-wider mb-4">Verifiable Credentials (SD-JWT)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREDENTIALS.filter(c => c.type === 'sd-jwt').map(renderCompactCard)}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-text-tertiary uppercase tracking-wider mb-4">Open Badges (OBv3)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREDENTIALS.filter(c => c.type === 'obv3').map(renderCompactCard)}
              </div>
            </div>
          </div>

          {/* Right Column: Central QR Display */}
          <div className="w-full lg:w-[400px] flex-shrink-0">
            <div className="sticky top-24 bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-border-secondary p-8 flex flex-col items-center justify-center min-h-[500px]">
              <AnimatePresence mode="wait">
                {!activeOffer ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center text-center opacity-50"
                  >
                    <div className="w-24 h-24 border-4 border-dashed border-border-secondary rounded-2xl flex items-center justify-center text-4xl mb-4">
                      📱
                    </div>
                    <h3 className="text-lg font-bold text-text-primary mb-2">No Credential Selected</h3>
                    <p className="text-sm text-text-secondary max-w-[250px]">
                      Select a credential from the list to generate an issuance QR code.
                    </p>
                  </motion.div>
                ) : activeOffer.loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4"></div>
                    <p className="font-semibold text-text-secondary">Generating Secure Offer...</p>
                  </motion.div>
                ) : activeOffer.error ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center text-center w-full"
                  >
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-2xl mb-4">
                      ⚠️
                    </div>
                    <h3 className="text-lg font-bold text-text-primary mb-2">Issuance Failed</h3>
                    <p className="text-sm text-red-500 mb-6 px-4">{activeOffer.error}</p>
                    <button
                      onClick={() => handleIssue(activeOffer.credentialType)}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="qr"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center w-full"
                  >
                    {(() => {
                      const cred = CREDENTIALS.find(c => c.id === activeOffer.credentialType);
                      const isIssued = activeOffer.status === 'credential_issued';
                      return (
                        <>
                          <div className="flex items-center gap-3 mb-6 bg-surface-50 dark:bg-surface-900 py-2 px-4 rounded-full border border-border-secondary">
                            <span className="text-2xl">{cred?.icon}</span>
                            <span className="font-bold text-text-primary">{cred?.name}</span>
                          </div>

                          <div className="mb-6">
                            {getStatusBadge(activeOffer.status)}
                          </div>

                          <div className={`bg-white p-4 rounded-2xl shadow-sm border border-border-secondary mb-8 transition-all duration-500 ${isIssued ? 'opacity-40 grayscale scale-95' : 'opacity-100'}`}>
                            <QRCodeSVG
                              value={activeOffer.uri}
                              size={240}
                              level="M"
                              includeMargin={false}
                            />
                          </div>

                          {!isIssued && (
                            <p className="text-sm text-text-secondary text-center mb-6">
                              Scan this QR code using your Essi wallet to accept the credential.
                            </p>
                          )}

                          <div className="flex w-full gap-3">
                            <button
                              onClick={() => navigator.clipboard.writeText(activeOffer.uri)}
                              className="flex-1 bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-text-primary font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                              Copy Link
                            </button>
                            <button
                              onClick={() => handleIssue(activeOffer.credentialType)}
                              className="bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-text-primary p-2.5 rounded-xl transition-colors"
                              title="Generate new offer"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
