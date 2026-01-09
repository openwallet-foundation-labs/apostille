"use client"
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import StepWrapper from './StepWrapper'
import StepOne from './StepOne'
import StepTwo from './StepTwo'
import StepThree from './StepThree'
import StepFour from './StepFour'
import StepProof from './StepProof'
import StepFive from './StepFive'

export interface FormData {
  // Extend as needed by the individual steps
  userType?: 'student' | 'lawyer'
  hasWallet?: boolean
  hasCredentials?: boolean
  oobId?: string           // OOB invitation ID from credential issuance
  connectionId?: string    // Connection ID (fetched after QR scan)
  proofId?: string         // Proof record ID
  proofVerified?: boolean  // Whether proof was verified
  [key: string]: any
}

export default function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [formData, setFormData] = useState<FormData>({})

  const steps = [
    { component: StepOne, title: "Choose Persona" },
    { component: StepTwo, title: "Learn About Wallet" },
    { component: StepThree, title: "Install Wallet" },
    { component: StepFour, title: "Get Credential" },
    { component: StepProof, title: "Verify Credential" },
    { component: StepFive, title: "Complete" }
  ]
  
  const totalSteps = steps.length
  const StepComponent = steps[currentStep].component

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 overflow-hidden">
      <div className="w-full max-w-6xl mx-auto px-4 py-6 h-full flex flex-col">
        
        {/* Progress Indicator */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex items-center justify-center mb-3">
            <div className="flex items-center space-x-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                    index < currentStep 
                      ? 'bg-green-500 text-white' 
                      : index === currentStep 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-surface-200 dark:bg-surface-700 text-text-tertiary'
                  }`}>
                    {index < currentStep ? '✓' : index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-2 transition-all duration-300 ${
                      index < currentStep ? 'bg-green-500' : 'bg-surface-200 dark:bg-surface-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-text-tertiary">
              Step {currentStep + 1} of {totalSteps}: {steps[currentStep].title}
            </p>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-surface-50 dark:bg-surface-800 rounded-2xl shadow-xl overflow-hidden flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                <StepWrapper>
                  <StepComponent
                    formData={formData}
                    setFormData={setFormData}
                  />
                </StepWrapper>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center px-6 py-4 bg-surface-100 dark:bg-surface-900/50 border-t border-border-secondary flex-shrink-0">
            <div className="flex-1">
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="inline-flex items-center px-4 py-2 bg-surface-200 dark:bg-surface-700 text-text-secondary rounded-lg hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors font-medium text-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back
                </button>
              )}
            </div>
            
            <div className="flex-1 text-center">
              <div className="text-sm text-text-tertiary">
                {currentStep + 1} / {totalSteps}
              </div>
            </div>
            
            <div className="flex-1 flex justify-end">
              {currentStep < totalSteps - 1 && (
                <button
                  onClick={nextStep}
                  className="inline-flex items-center px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg shadow-md transition-all duration-200 font-medium hover:shadow-lg text-sm"
                >
                  Next
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}