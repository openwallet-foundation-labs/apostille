'use client'
import Image from "next/image";
import { motion } from 'framer-motion'
import Link from "next/link";

interface pageProps {
    
}

export default function page({ }: pageProps) {
    
    const features = [
        {
            icon: "🔐",
            title: "Secure & Private",
            description: "Your credentials are encrypted and stored securely on your device"
        },
        {
            icon: "⚡",
            title: "Instant Verification",
            description: "Share your credentials instantly without physical documents"
        },
        {
            icon: "🎯",
            title: "Selective Disclosure",
            description: "Share only the information that's needed for each interaction"
        }
    ];

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-surface-100 to-primary-100 dark:from-surface-900 dark:to-surface-800">
            <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row justify-center items-center min-h-screen px-6 py-12">

                {/* Content Section */}
                <div className="flex-1 lg:w-1/2 px-6 py-8 flex flex-col justify-center items-start gap-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="space-y-6"
                    >
                        <div className="space-y-4">
                            <h1 className="font-bold text-6xl lg:text-7xl text-text-primary leading-tight">
                                Esse Wallet
                                <span className="block text-primary-600 dark:text-primary-400 text-4xl lg:text-5xl">
                                    Showcase
                                </span>
                            </h1>

                            <p className="text-xl text-text-secondary max-w-2xl leading-relaxed">
                                Explore the future of digital identity with Esse Wallet. Experience how you can securely store,
                                manage, and share your verifiable credentials with complete privacy and control.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link 
                                href="/wallet/demo" 
                                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-4 rounded-lg shadow-lg text-xl hover:scale-105 transition-all duration-300 text-center"
                            >
                                Start Demo
                            </Link>
                            
                            <button className="border-2 border-primary-600 text-primary-600 hover:bg-primary-600 hover:text-white font-semibold px-8 py-4 rounded-lg text-xl transition-all duration-300">
                                Learn More
                            </button>
                        </div>
                    </motion.div>

                    {/* Features Grid */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl"
                    >
                        {features.map((feature, index) => (
                            <div key={index} className="bg-surface-50 dark:bg-surface-800 rounded-lg p-4 shadow-sm border border-border-secondary">
                                <div className="text-2xl mb-2">{feature.icon}</div>
                                <h3 className="font-semibold text-text-primary mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-text-secondary">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* Image Section */}
                <div className="flex-1 lg:w-1/2 px-6 py-8 flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="relative"
                    >
                        <div className="w-80 h-80 lg:w-96 lg:h-96 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center shadow-2xl">
                            <div className="text-white text-8xl lg:text-9xl">
                                📱
                            </div>
                        </div>
                        
                        {/* Floating Elements */}
                        <div className="absolute -top-4 -right-4 w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-2xl">🔐</span>
                        </div>
                        
                        <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-xl">✓</span>
                        </div>
                        
                        <div className="absolute top-1/2 -right-8 w-12 h-12 bg-blue-400 rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-lg">⚡</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}