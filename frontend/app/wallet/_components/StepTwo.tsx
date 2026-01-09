import { Dispatch } from "react";

interface StepTwoProps{
    formData: any;
    setFormData: Dispatch<any>
}

export default function StepTwo({ formData, setFormData }: StepTwoProps) {
    const benefits = [
        {
            icon: "🔐",
            title: "Secure Storage",
            description: "Encrypted and stored securely on your device"
        },
        {
            icon: "⚡",
            title: "Instant Verification",
            description: "Share credentials instantly without physical documents"
        },
        {
            icon: "🎯",
            title: "Privacy First",
            description: "Share only what's needed - you control your data"
        },
        {
            icon: "🌐",
            title: "Universal Access",
            description: "Use your credentials anywhere, online and in-person"
        }
    ];

    return (
        <div className="w-full h-full">
            <div className="relative w-full flex flex-col justify-center gap-6 px-4 py-4 max-w-4xl mx-auto">
                <div className="text-center mb-4">
                    <h2 className="font-bold text-3xl text-text-primary mb-3">
                        Welcome to Esse Wallet
                    </h2>
                    <p className="text-base text-text-secondary">
                        Your secure digital identity solution. Store, manage, and share verifiable credentials with complete privacy and control.
                    </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-4">
                    <h3 className="font-semibold text-lg text-blue-900 dark:text-blue-100 mb-2">
                        How Digital Credentials Work
                    </h3>
                    <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
                        Digital credentials are cryptographically signed by trusted institutions, making them tamper-proof and instantly verifiable.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {benefits.map((benefit, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-surface-50 dark:bg-surface-800 rounded-lg shadow-sm border border-border-secondary">
                            <div className="text-2xl">{benefit.icon}</div>
                            <div>
                                <h4 className="font-semibold text-base text-text-primary mb-1">
                                    {benefit.title}
                                </h4>
                                <p className="text-text-secondary text-sm">
                                    {benefit.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}