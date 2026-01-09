import { Dispatch } from "react"

interface StepOneProps{
    formData: any,
    setFormData: Dispatch<any>
}

export default function StepOne({ formData, setFormData }: StepOneProps) {
    const personas = [
        {
            id: 'student',
            name: 'Alice',
            role: 'Student',
            description: 'Alice is a student at Digital University. She wants to get a digital Student ID card to put in her Esse Wallet for easy access to campus services and student discounts.',
            emoji: '🎓'
        },
        {
            id: 'lawyer',
            name: 'Joyce',
            role: 'Lawyer',
            description: 'Joyce is a licensed attorney in good standing with the Bar Association. She has professional credentials and wants to use digital identity for secure client interactions.',
            emoji: '⚖️'
        }
    ];

    return (
        <div className="w-full h-full">
            <div className="relative w-full min-h-full flex flex-col justify-center gap-10 px-8 py-6">
                <div className="text-center mb-8">
                    <h2 className="font-bold text-4xl text-text-primary mb-4">
                        Choose Your Demo Persona
                    </h2>
                    <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                        Select which character you'd like to experience this demo as. Each persona has different credentials and use cases for Esse Wallet.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    {personas.map((persona) => (
                        <button
                            key={persona.id}
                            onClick={() => setFormData({ ...formData, userType: persona.id })}
                            className={`p-6 rounded-xl border-2 transition-all duration-300 hover:scale-105 text-left ${
                                formData.userType === persona.id
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-lg'
                                    : 'border-border-secondary bg-surface-50 dark:bg-surface-800 hover:border-primary-300 hover:shadow-md'
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-3xl shadow-md">
                                    {persona.emoji}
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="font-bold text-xl text-text-primary">
                                            {persona.name}
                                        </h3>
                                        <span className="px-2 py-1 bg-primary-100 dark:bg-primary-800 text-primary-800 dark:text-primary-200 rounded-full text-sm font-medium">
                                            {persona.role}
                                        </span>
                                    </div>
                                    
                                    <p className="text-text-secondary text-sm leading-relaxed">
                                        {persona.description}
                                    </p>
                                </div>
                            </div>
                            
                            {formData.userType === persona.id && (
                                <div className="mt-4 flex items-center gap-2 text-primary-600 dark:text-primary-400">
                                    <span className="text-sm font-medium">✓ Selected</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                <div className="text-center mt-8">
                    <p className="text-sm text-text-tertiary">
                        Don't worry, you can always come back and try the other persona later!
                    </p>
                </div>
            </div>
        </div>
    )
}