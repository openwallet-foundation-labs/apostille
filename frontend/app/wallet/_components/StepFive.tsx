import { Dispatch } from "react"

interface StepFiveProps{
    formData: any,
    setFormData: Dispatch<any>,
    onComplete?: () => void
}

export default function StepFive({ setFormData, formData, onComplete }: StepFiveProps) {
    return (
        <div className="w-full h-full">
            <div className="relative w-full flex flex-col justify-center items-center gap-6 px-4 py-4 max-w-4xl mx-auto text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-2">
                    <span className="text-2xl">🎉</span>
                </div>
                
                <h2 className="font-bold text-3xl text-text-primary">
                    Congratulations!
                </h2>
                
                <div className="max-w-lg space-y-3">
                    <p className="text-base text-text-secondary">
                        You've successfully completed the Esse Wallet demo as{" "}
                        <span className="font-semibold text-primary-600">
                            {formData.userType === 'student' ? 'Alice the Student' : 'Joyce the Lawyer'}
                        </span>!
                    </p>

                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-left">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">What you accomplished:</p>
                        <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                Received a digital credential in your wallet
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                Verified your credential with a relying party
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                Experienced selective disclosure of attributes
                            </li>
                        </ul>
                    </div>

                    <p className="text-sm text-text-tertiary">
                        You've learned how to use Esse Wallet to securely store, manage, and prove your digital credentials.
                    </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 max-w-lg w-full">
                    <h3 className="font-semibold text-base text-blue-900 dark:text-blue-100 mb-3">
                        What's Next?
                    </h3>
                    <ul className="text-left space-y-1 text-sm text-blue-800 dark:text-blue-200">
                        <li>• Download Esse Wallet from your app store</li>
                        <li>• Connect with participating institutions</li>
                        <li>• Start using your digital credentials</li>
                        <li>• Experience secure digital identity</li>
                    </ul>

                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        <a
                            href="https://apps.apple.com/in/app/esse/id6746117055"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-3 py-2 bg-black text-white rounded-lg hover:bg-surface-800 transition-colors text-xs font-medium"
                        >
                            <span>📱</span>
                            <span>Download on App Store</span>
                        </a>
                        <a
                            href="https://play.google.com/store/apps/details?id=inc.ajna.esse"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-3 py-2 bg-black text-white rounded-lg hover:bg-surface-800 transition-colors text-xs font-medium"
                        >
                            <span>🤖</span>
                            <span>Get it on Google Play</span>
                        </a>
                    </div>
                </div>

                <div className="flex gap-3 mt-4">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-surface-200 dark:bg-surface-700 text-text-secondary rounded-lg hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors text-sm"
                    >
                        Start Over
                    </button>
                    
                    <button
                        onClick={onComplete}
                        className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all text-sm"
                    >
                        Finish Demo
                    </button>
                </div>
            </div>
        </div>
    )
}