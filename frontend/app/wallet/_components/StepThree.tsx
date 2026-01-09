import { Dispatch } from "react"

interface StepThreeProps{
    formData: any,
    setFormData: Dispatch<any>
}

export default function StepThree({ formData, setFormData }: StepThreeProps) {
    const platforms = [
        {
            name: 'iOS',
            icon: '📱',
            store: 'App Store',
            description: 'Available for iPhone and iPad',
            url: 'https://apps.apple.com/in/app/esse/id6746117055'
        },
        {
            name: 'Android',
            icon: '🤖',
            store: 'Google Play',
            description: 'Available for Android devices',
            url: 'https://play.google.com/store/apps/details?id=inc.ajna.esse'
        }
    ];

    return (
        <div className="w-full h-full">
            <div className="relative w-full flex flex-col justify-center gap-6 px-4 py-4 max-w-4xl mx-auto">
                <div className="text-center mb-4">
                    <h2 className="font-bold text-3xl text-text-primary mb-3">
                        Install Esse Wallet
                    </h2>
                    <p className="text-base text-text-secondary">
                        Download the Esse Wallet app to securely store and manage your digital credentials.
                    </p>
                </div>

                <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl p-6">
                    <div className="flex items-center justify-center mb-4">
                        <div className="w-16 h-16 bg-primary-500 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
                            📱
                        </div>
                    </div>
                    
                    <div className="text-center mb-4">
                        <h3 className="font-bold text-xl text-text-primary mb-1">
                            Esse Wallet
                        </h3>
                        <p className="text-text-secondary text-sm">
                            by ajna.inc
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {platforms.map((platform, index) => (
                            <a
                                key={index}
                                href={platform.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setFormData({...formData, hasWallet: true})}
                                className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800 rounded-lg shadow-sm border border-border-secondary hover:shadow-md hover:scale-105 transition-all duration-300"
                            >
                                <div className="text-2xl">{platform.icon}</div>
                                <div className="flex-1 text-left">
                                    <h4 className="font-semibold text-base text-text-primary">
                                        {platform.name}
                                    </h4>
                                    <p className="text-sm text-text-secondary">
                                        {platform.description}
                                    </p>
                                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                                        Download from {platform.store}
                                    </p>
                                </div>
                                <div className="text-primary-600 dark:text-primary-400">
                                    →
                                </div>
                            </a>
                        ))}
                    </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 justify-center mb-1">
                        <span className="text-yellow-600 dark:text-yellow-400">💡</span>
                        <span className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm">Demo Note</span>
                    </div>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 text-center">
                        For this demo, you can skip the installation. In a real scenario, you would download the app.
                    </p>
                </div>
            </div>
        </div>
    )
}